import * as Tone from 'tone';
import { audioEngine, type NoteEvent } from './audioEngine';
import type { InstrumentType } from '../utils/noteColors';
import { useGraphicsStore } from './graphicsStore';
import { renderExportAudio } from './exportAudio';
import { captureExportFrames, assertWebpExportSupported, type ExportFrame } from './exportRenderer';
import { buildZipArchive, type ZipEntryInput } from './zipWriter';
import { EXPORT_PRESETS, type ExportQuality } from '../types/exportPresets';
import { getExportToken } from './exportToken';

const API_BASE: string =
  (import.meta.env.VITE_TRANSCRIBE_API_URL as string | undefined) ??
  'http://localhost:8000';

/**
 * Export progress stages, in order (design §9). 'Capturing frames' and
 * 'Uploading' additionally carry a precise 0..1 `detail` fraction; the
 * others are coarse/spinner-only since their underlying work has no native
 * per-step progress hook (Tone.Offline, server-side ffmpeg encode).
 */
export type ExportStage =
  | 'Rendering audio'
  | 'Capturing frames'
  | 'Packaging'
  | 'Uploading'
  | 'Encoding'
  | 'Done';

export interface ExportProgress {
  stage: ExportStage;
  /** 0..1 fraction WITHIN the current stage, when known; undefined for
   * spinner-only stages (Rendering audio / Packaging / Encoding). */
  detail?: number;
}

/** Discriminates the user-facing error mapping from design §10's FAILURES
 * table — every branch the UI must distinguish (401/403/413/429/504 plus a
 * generic catch-all for network/unexpected errors). */
export type ExportErrorCode =
  | 'auth-required'
  | 'token-expired'
  | 'token-invalid'
  | 'too-large'
  | 'quota-exceeded'
  | 'timeout'
  | 'aborted'
  | 'unsupported-browser'
  | 'unknown';

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

export interface ExportOptions {
  notes: readonly NoteEvent[];
  instrument: InstrumentType;
  /** Scene-space scroll speed (same units Scene/FallingBars already use —
   * see Visualizer3D's `sceneScrollSpeed`), so the export visually matches
   * what's on screen right now. */
  scrollSpeed: number;
  durationSec: number;
  quality: ExportQuality;
  /** Live audioEngine.pianoSustain — exportAudio needs this explicitly so
   * the rendered export audio is WYSIWYG with whatever the user last
   * toggled, since the offline render has no access to the live engine. */
  pianoSustain: boolean;
  /** Supabase access token — required; /export/mp4 always needs auth. */
  accessToken: string;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  objectUrl: string;
  filename: string;
}

/**
 * Orchestrates a full MP4 export end-to-end (design §9/§10):
 *   1. pause live playback, remember Transport.seconds
 *   2. render audio offline (Tone.Offline, synth-only, WYSIWYG pianoSustain)
 *   3. capture frames deterministically (forced postFX/particles)
 *   4. package frames into a STORE-only zip + build multipart form
 *   5. POST to /export/mp4 with Authorization + X-Export-Token, tracking
 *      upload progress via XHR
 *   6. on success, hand back an object URL + suggested filename for the
 *      caller to trigger a <a download>
 * ALWAYS restores live Transport.seconds + requests one repaint on
 * completion/cancel/error, regardless of how the export ends.
 */
export async function runExport(options: ExportOptions): Promise<ExportResult> {
  const {
    notes,
    instrument,
    scrollSpeed,
    durationSec,
    quality,
    pianoSustain,
    accessToken,
    onProgress,
    signal,
  } = options;

  const preset = EXPORT_PRESETS[quality];
  const exportToken = getExportToken();
  if (!exportToken) {
    throw new ExportError('token-invalid', 'No export token available — reload your piece and try again.');
  }

  // Step 1: pause live playback, remember exactly where it was so we can
  // restore it byte-for-byte regardless of how this export ends.
  const wasPlaying = audioEngine.isPlaying;
  const liveTransportSeconds = Tone.getTransport().seconds;
  if (wasPlaying) audioEngine.pause();

  try {
    throwIfAborted(signal);

    // WEBP-ONLY contract: the backend's `_extract_frames` self-generates
    // `frame_%06d.webp` filenames and assumes WebP bytes — there is no
    // fallback decoder on the server. Fail loud here, BEFORE any audio
    // render or frame capture work starts, rather than silently uploading a
    // corrupt (non-WebP-but-named-.webp) archive on browsers without WebP
    // canvas encoding. Every browser that runs this app already supports
    // WebGL, so this should only ever throw on a genuinely unsupported
    // browser — never as a "normal" path.
    try {
      await assertWebpExportSupported();
    } catch {
      throw new ExportError('unsupported-browser', 'Your browser does not support video export.');
    }

    throwIfAborted(signal);

    // Step 2: offline synth-only audio render (design §5 — SYNTH ONLY even
    // if the live A/B source is 'both'/'mp3').
    onProgress?.({ stage: 'Rendering audio' });
    const audioResult = await renderExportAudio({
      notes,
      instrument,
      durationSec,
      pianoSustain,
      // Mono: the server re-encodes this to AAC anyway, and an uncompressed
      // stereo 16-bit WAV is the second-biggest chunk of the upload on a long
      // piece (~106 MB for 5 min). Mono halves that with no audible loss in a
      // visualizer export.
      numChannels: 1,
      signal,
    });

    throwIfAborted(signal);

    // Step 3: deterministic frame capture, forced postFX/particles via the
    // export preset (NOT the live graphics store — see exportRenderer.ts).
    const frameResult = await captureExportFrames({
      notes,
      instrument,
      scrollSpeed,
      quality,
      durationSec,
      onProgress: (captured, total) => {
        onProgress?.({ stage: 'Capturing frames', detail: total > 0 ? captured / total : 0 });
      },
      signal,
    });

    throwIfAborted(signal);

    // Step 4: package frames into one ordered STORE-only zip archive
    // (frame_%06d.webp), matching the cross-repo contract's `frames` field.
    // WEBP-ONLY — there is no extension branching here; frameFormat is
    // always 'image/webp' (assertWebpExportSupported above guarantees this,
    // or the export has already failed loud before reaching this point).
    onProgress?.({ stage: 'Packaging' });
    // Decode frame blobs to bytes ONE AT A TIME, releasing each Blob ref as we
    // go — NOT Promise.all, which would hold every Blob AND its decoded
    // Uint8Array copy alive simultaneously, roughly doubling peak heap and
    // risking an OOM tab-kill on a long high-quality export before the upload
    // even starts. `captured` is the same array instance as frameResult.frames;
    // we null each slot once converted so the Blob can be GC'd before the next.
    const captured = frameResult.frames as (ExportFrame | null)[];
    const zipEntries: ZipEntryInput[] = [];
    for (let i = 0; i < captured.length; i++) {
      const frame = captured[i];
      if (!frame) continue;
      zipEntries.push({
        name: `frame_${frame.index.toString().padStart(6, '0')}.webp`,
        data: new Uint8Array(await frame.blob.arrayBuffer()),
      });
      captured[i] = null;
    }
    const framesArchive = buildZipArchive(zipEntries);

    throwIfAborted(signal);

    const meta = {
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      durationSec,
      quality,
      frameCount: frameResult.frameCount,
      audioSampleRate: audioResult.sampleRate,
    };

    // Step 5: multipart upload with both required headers (design §6/§8).
    onProgress?.({ stage: 'Uploading', detail: 0 });
    const mp4Blob = await uploadExport({
      audioBlob: audioResult.wavBlob,
      framesArchive,
      meta,
      accessToken,
      exportToken,
      onUploadProgress: (frac) => onProgress?.({ stage: 'Uploading', detail: frac }),
      onEncoding: () => onProgress?.({ stage: 'Encoding' }),
      signal,
    });

    const objectUrl = URL.createObjectURL(mp4Blob);
    const filename = `notejoscaz-${instrument}-${quality}.mp4`;

    onProgress?.({ stage: 'Done' });

    return { blob: mp4Blob, objectUrl, filename };
  } finally {
    // ALWAYS restore live state, regardless of success/abort/error — design
    // §9's lifecycle contract. Transport.seconds first, then a single
    // repaint request (graphicsStore.bumpRepaint) so the demand-mode
    // FrameDriver — frozen on whatever frame the export loop last forced —
    // paints once more at the restored live position.
    Tone.getTransport().seconds = liveTransportSeconds;
    useGraphicsStore.getState().bumpRepaint();
    if (wasPlaying && !signal?.aborted) {
      void audioEngine.play();
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ExportError('aborted', 'Export cancelled.');
  }
}

interface UploadExportOptions {
  audioBlob: Blob;
  framesArchive: Blob;
  meta: Record<string, unknown>;
  accessToken: string;
  exportToken: string;
  onUploadProgress?: (fraction: number) => void;
  onEncoding?: () => void;
  signal?: AbortSignal;
}

/**
 * POSTs the multipart/form-data export payload via XHR (not fetch) because
 * we need real upload-progress events (design §9's 'Uploading' % stage) —
 * fetch's streaming-upload-progress story is still inconsistent across
 * browsers, whereas `xhr.upload.onprogress` is universally supported.
 *
 * Maps HTTP status -> ExportError per design §10's FAILURES table:
 *   401 -> token-expired/auth-required, 403 -> token-invalid,
 *   413 -> too-large, 429 -> quota-exceeded, 504 -> timeout.
 */
function uploadExport(opts: UploadExportOptions): Promise<Blob> {
  const { audioBlob, framesArchive, meta, accessToken, exportToken, onUploadProgress, onEncoding, signal } = opts;

  return new Promise<Blob>((resolve, reject) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'audio.wav');
    form.append('frames', framesArchive, 'frames.zip');
    // Send meta as a plain form FIELD (a string), NOT a Blob with a filename.
    // A multipart part that carries a filename is parsed as a file/UploadFile
    // by FastAPI, but the endpoint declares `meta: str = Form(...)` — sending
    // it as a file makes that validation fail with 422 Unprocessable Entity.
    form.append('meta', JSON.stringify(meta));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/export/mp4`);
    xhr.responseType = 'blob';
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('X-Export-Token', exportToken);

    const onAbort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) {
        reject(new ExportError('aborted', 'Export cancelled.'));
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
    const cleanupAbortListener = () => signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      onUploadProgress?.(ev.loaded / ev.total);
    };
    xhr.upload.onloadend = () => {
      // Server-side work (token verify, quota check, ffmpeg encode) happens
      // after the browser finishes uploading bytes — surface that as the
      // 'Encoding' spinner stage until xhr.onload finally fires.
      onEncoding?.();
    };

    xhr.onload = () => {
      cleanupAbortListener();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Blob);
        return;
      }
      reject(mapStatusToExportError(xhr.status));
    };
    xhr.onerror = () => {
      cleanupAbortListener();
      reject(new ExportError('unknown', 'Network error while uploading export.'));
    };
    xhr.onabort = () => {
      cleanupAbortListener();
      reject(new ExportError('aborted', 'Export cancelled.'));
    };
    xhr.ontimeout = () => {
      cleanupAbortListener();
      reject(new ExportError('timeout', 'Export timed out on the server — try a lower quality.'));
    };

    xhr.send(form);
  });
}

function mapStatusToExportError(status: number): ExportError {
  switch (status) {
    case 401:
      return new ExportError('token-expired', 'Your session or export token expired. Reload your piece and try again.');
    case 403:
      return new ExportError('token-invalid', 'This piece is not eligible for export. Reload your piece and try again.');
    case 413:
      return new ExportError('too-large', 'The export is too large — pick a lower quality.');
    case 429:
      return new ExportError('quota-exceeded', "You've reached today's export limit. Try again tomorrow.");
    case 504:
      return new ExportError('timeout', 'Export timed out on the server — try a lower quality.');
    default:
      return new ExportError('unknown', `Export failed (server returned ${status}).`);
  }
}
