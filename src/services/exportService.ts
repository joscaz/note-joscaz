import * as Tone from 'tone';
import { audioEngine, type NoteEvent } from './audioEngine';
import type { InstrumentType } from '../utils/noteColors';
import { useGraphicsStore } from './graphicsStore';
import { renderExportAudio } from './exportAudio';
import { captureExportFrames } from './exportRenderer';
import { resolveH264Codec, createExportMuxer, type ExportMuxer } from './exportMuxer';
import { EXPORT_PRESETS, type ExportQuality } from '../types/exportPresets';

/**
 * Export progress stages, in order (design §9). 'Encoding video' additionally
 * carries a precise 0..1 `detail` fraction; the others are coarse/spinner-only
 * since their underlying work has no native per-step progress hook.
 */
export type ExportStage =
  | 'Rendering audio'
  | 'Encoding video'
  | 'Finalizing'
  | 'Done';

export interface ExportProgress {
  stage: ExportStage;
  /** 0..1 fraction WITHIN the current stage, when known; undefined for
   * spinner-only stages (Rendering audio / Finalizing). */
  detail?: number;
}

/** Discriminates the user-facing error mapping — every branch the UI must
 * distinguish for the client-side WebCodecs pipeline. */
export type ExportErrorCode =
  | 'unsupported-browser'
  | 'aborted'
  | 'encode-failed'
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
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  /** Object URL for the MP4 blob. The CALLER owns its lifetime and MUST call
   * URL.revokeObjectURL(objectUrl) once the download has been triggered or the
   * export dialog is dismissed — this module never revokes it. */
  objectUrl: string;
  filename: string;
}

/**
 * Orchestrates a full client-side MP4 export end-to-end (design §9):
 *   1. Pause live playback, remember Transport.seconds.
 *   2. Probe for a supported H.264 codec string via resolveH264Codec.
 *   3. Create the muxer (starts mediabunny Output).
 *   4. Render audio offline (Tone.Offline, synth-only, WYSIWYG pianoSustain)
 *      and feed chunks to the muxer as f32-planar AudioData objects.
 *   5. Capture frames deterministically (forced postFX/particles) and feed
 *      each to the muxer as a VideoFrame.
 *   6. Finalize the muxer — flushes both encoders, calls output.finalize(),
 *      and returns the MP4 ArrayBuffer.
 *   7. Wrap the ArrayBuffer in a Blob, create an object URL, and return it.
 * ALWAYS disposes the muxer and restores live Transport.seconds + requests
 * one repaint on completion/cancel/error, regardless of how the export ends.
 */
export async function runExport(options: ExportOptions): Promise<ExportResult> {
  const {
    notes,
    instrument,
    scrollSpeed,
    durationSec,
    quality,
    pianoSustain,
    onProgress,
    signal,
  } = options;

  const preset = EXPORT_PRESETS[quality];

  // Step 1: pause live playback, remember exactly where it was so we can
  // restore it regardless of how this export ends.
  const wasPlaying = audioEngine.isPlaying;
  const liveTransportSeconds = Tone.getTransport().seconds;
  if (wasPlaying) audioEngine.pause();

  let muxer: ExportMuxer | undefined;

  try {
    throwIfAborted(signal);

    // Step 2: probe for a supported H.264 codec string. If none is found the
    // browser does not support the WebCodecs pipeline — fail early and loud.
    const videoCodec = await resolveH264Codec({
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      bitrate: preset.videoBitrate,
    });
    if (videoCodec === null) {
      throw new ExportError(
        'unsupported-browser',
        'Your browser does not support video export. Try Chrome or Edge.',
      );
    }

    throwIfAborted(signal);

    // Step 3: create the muxer — starts the mediabunny Output and configures
    // the WebCodecs VideoEncoder. audioSampleRate/audioChannels are informational
    // only (inferred from the first AudioSample added by addAudioChunk).
    muxer = await createExportMuxer({
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      videoCodec,
      videoBitrate: preset.videoBitrate,
      audioSampleRate: 44_100,
      audioChannels: 1,
      audioBitrate: preset.audioBitrate,
    });

    throwIfAborted(signal);

    // Step 4: offline synth-only audio render (SYNTH ONLY even if the live
    // A/B source is 'both'/'mp3'). Chunks are fed directly to the muxer.
    onProgress?.({ stage: 'Rendering audio' });
    await renderExportAudio({
      notes,
      instrument,
      durationSec,
      pianoSustain,
      // Mono: halves the transient AudioData copy size with no audible loss
      // in a visualizer export, and matches the muxer's audioChannels: 1.
      numChannels: 1,
      muxer,
      signal,
    });

    throwIfAborted(signal);

    // Step 5: deterministic frame capture, forced postFX/particles via the
    // export preset (NOT the live graphics store — see exportRenderer.ts).
    // Each frame is fed to the muxer as a VideoFrame at its precise µs timestamp.
    onProgress?.({ stage: 'Encoding video' });
    try {
      await captureExportFrames({
        notes,
        instrument,
        scrollSpeed,
        quality,
        durationSec,
        muxer,
        onProgress: (captured, total) => {
          onProgress?.({ stage: 'Encoding video', detail: total > 0 ? captured / total : 0 });
        },
        signal,
      });
    } catch (err) {
      // A VideoEncoder error during capture transitions the encoder to
      // 'closed', so the next addVideoFrame() throws a raw DOMException
      // (InvalidStateError) that escapes here — map it to 'encode-failed'
      // like finalize() does. Abort wins over encode-failed: if the signal
      // fired, surface 'aborted' even if the symptom is a DOMException.
      if (signal?.aborted) throw new ExportError('aborted', 'Export cancelled.');
      if (err instanceof DOMException) {
        throw new ExportError('encode-failed', `Video encoding failed: ${err.message}`);
      }
      throw err;
    }

    throwIfAborted(signal);

    // Step 6: finalize the muxer — flushes the video encoder, drains all
    // pending mux operations, and calls output.finalize() to write the MP4
    // container (moov box, etc.). Wrap DOMException in a typed ExportError
    // so the UI can surface 'encode-failed' with a readable message.
    onProgress?.({ stage: 'Finalizing' });
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await muxer.finalize();
    } catch (err) {
      if (err instanceof DOMException) {
        throw new ExportError('encode-failed', `Video encoding failed: ${err.message}`);
      }
      throw err;
    }

    const mp4Blob = new Blob([arrayBuffer], { type: 'video/mp4' });
    const objectUrl = URL.createObjectURL(mp4Blob);
    const filename = `notejoscaz-${instrument}-${quality}.mp4`;

    onProgress?.({ stage: 'Done' });

    return { blob: mp4Blob, objectUrl, filename };
  } finally {
    // Dispose the muxer (closes encoders and cancels Output if not finalized).
    // Idempotent — safe to call after a successful finalize() or on abort.
    muxer?.dispose();
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
