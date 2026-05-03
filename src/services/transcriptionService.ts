/**
 * Backend-driven transcription pipeline.
 *
 * Pipeline:
 *   File (browser <input type=file>)
 *     -> multipart POST ${VITE_TRANSCRIBE_API_URL}/transcribe/{instrument}
 *     -> audio/midi bytes
 *     -> new Midi(Uint8Array)
 *     -> TranscriptionResult
 *
 * The real model lives in the `note-joscaz-backend` FastAPI service (PyTorch
 * Onsets & Velocities, vendored from the original training repo). We hit it
 * with the raw upload and get a playable `.mid` back.
 *
 * Demo/fallback: if no `file` is provided, or the backend is unreachable / a
 * request fails, we return the mock MIDI so the landing-page teaser still
 * animates end-to-end and the UI never dead-ends.
 */

import { Midi } from '@tonejs/midi';
import type { InstrumentType } from '../utils/noteColors';
import { generateMockMidi } from '../utils/mockMidi';

const API_BASE: string =
  (import.meta.env.VITE_TRANSCRIBE_API_URL as string | undefined) ??
  'http://localhost:8000';

export class TranscriptionLimitError extends Error {
  constructor() {
    super('Transcription limit reached');
    this.name = 'TranscriptionLimitError';
  }
}

export interface TranscriptionResult {
  midi: Midi;
  bpm: number;
  timeSignature: [number, number];
  instrumentType: InstrumentType;
  /** `true` if the MIDI came from the real backend, `false` if mock. */
  real: boolean;
}

export interface TranscribeOptions {
  /** Called with a 0..1 progress value so the UI can drive its progress bar. */
  onProgress?: (progress: number, stage: string) => void;
  /** Original audio file — required for real inference. */
  file?: File;
  /** Supabase access token — required for authenticated transcription. */
  accessToken?: string;
}

const STAGES = ['Uploading', 'Transcribing on server', 'Building MIDI'] as const;

export function getPipelineStages(): readonly string[] {
  return STAGES;
}

export async function transcribe(
  audioBuffer: AudioBuffer | null,
  instrument: InstrumentType,
  opts: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const { onProgress, file, accessToken } = opts;

  if (!file) {
    // Pure demo path: staged animation + mock MIDI.
    return mockTranscribe(instrument, onProgress);
  }

  try {
    const midiBytes = await uploadAndTranscribe(
      file,
      instrument,
      audioBuffer?.duration,
      onProgress,
      accessToken,
    );

    // Stage 2: parse the MIDI bytes.
    emitProgress(onProgress, 2, 0);
    const midi = new Midi(new Uint8Array(midiBytes));
    if (instrument === 'piano') {
      clampPianoDurations(midi);
    }
    emitProgress(onProgress, 2, 1);
    onProgress?.(1, 'Complete');

    return {
      midi,
      bpm: midi.header.tempos[0]?.bpm ?? 120,
      timeSignature:
        (midi.header.timeSignatures[0]?.timeSignature as [number, number]) ?? [
          4,
          4,
        ],
      instrumentType: instrument,
      real: true,
    };
  } catch (err) {
    if (err instanceof TranscriptionLimitError) throw err;
    console.warn(
      '[NoteJoscaz] Backend transcription failed, falling back to mock:',
      err,
    );
    return mockTranscribe(instrument, onProgress);
  }
}

/* ------------------------- piano duration clean-up ------------------------ */

/**
 * Piano durations are **UX-only** in this app.
 *
 * The Onsets & Velocities model emits onsets, not note_offs, so any duration
 * attached to a piano note is synthesized downstream (the backend's
 * `?mode=web` path uses hold-until-next-same-pitch capped at 4 s so that
 * `@tonejs/midi` can parse the track at all).
 *
 * The *audio path ignores `note.duration` for piano entirely* —
 * `audioEngine.loadMidi` triggers each piano note with `triggerAttack` and
 * lets the Salamander sample's own tail play out. That's what a DAW does
 * with the CLI `note_on`-only `.mid` and it's sonically truthful to the
 * model (no fabricated sustain). See the scheduling loop in `audioEngine.ts`.
 *
 * We still need *some* duration for the UI, because:
 *   1. the piano roll draws each note as a falling bar of height
 *      `duration * scrollSpeed`, so `duration === 0` is invisible;
 *   2. the keyboard "glow" under the hit line treats a key as active for
 *      `[time, time + duration]`.
 *
 * The backend's 4 s cap is way too long for either purpose (bars tower off
 * the canvas, keys glow for seconds after a tap). Here we re-derive a short
 * cosmetic duration: gap-to-next-same-pitch onset capped at 0.30 s.
 * *Nothing in the audio path reads these numbers.*
 */
const PIANO_MAX_DURATION_SEC = 0.30;
const PIANO_RELEASE_GAP_SEC = 0.02; // leave a tiny gap before re-triggering the same pitch

function clampPianoDurations(midi: Midi): void {
  const buckets = new Map<number, { time: number; setDuration: (d: number) => void }[]>();
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      const arr = buckets.get(note.midi) ?? [];
      arr.push({
        time: note.time,
        setDuration: (d: number) => {
          note.duration = d;
        },
      });
      buckets.set(note.midi, arr);
    }
  }

  for (const entries of buckets.values()) {
    entries.sort((a, b) => a.time - b.time);
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      const gap = next ? next.time - cur.time - PIANO_RELEASE_GAP_SEC : PIANO_MAX_DURATION_SEC;
      cur.setDuration(Math.max(0.02, Math.min(PIANO_MAX_DURATION_SEC, gap)));
    }
  }
}

/* -------------------------- backend request helper ------------------------ */

function uploadAndTranscribe(
  file: File,
  instrument: InstrumentType,
  audioDurationSec: number | undefined,
  onProgress: TranscribeOptions['onProgress'],
  accessToken?: string,
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    // `mode=web` asks the backend to emit explicit note_on/note_off pairs so
    // @tonejs/midi can parse playable notes. Without this, piano tracks come
    // back as note_on-only (DAW-friendly but parses to 0 notes in-browser).
    xhr.open('POST', `${API_BASE}/transcribe/${instrument}?mode=web`);
    xhr.responseType = 'arraybuffer';
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    }

    // --- Stage 1: fake progress while we wait for the server ---
    // The backend doesn't stream progress; estimate how long inference takes
    // (CPU Onsets & Velocities runs roughly at ~4x realtime on modern
    // hardware). Tween 0 → 0.9 over `estimateSec`, then hold until the
    // response lands.
    let tweenTimer: ReturnType<typeof setInterval> | null = null;
    const startTweening = () => {
      const estimateSec = clamp((audioDurationSec ?? 30) * 0.25, 3, 30);
      const startedAt = performance.now();
      tweenTimer = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const frac = Math.min(0.9, elapsed / estimateSec);
        emitProgress(onProgress, 1, frac);
      }, 200);
    };
    const stopTweening = () => {
      if (tweenTimer !== null) {
        clearInterval(tweenTimer);
        tweenTimer = null;
      }
    };

    // --- Stage 0: upload progress (real bytes sent) ---
    emitProgress(onProgress, 0, 0);
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      emitProgress(onProgress, 0, ev.loaded / ev.total);
    };
    xhr.upload.onload = () => {
      emitProgress(onProgress, 0, 1);
      emitProgress(onProgress, 1, 0);
      startTweening();
    };

    xhr.onload = () => {
      stopTweening();
      if (xhr.status >= 200 && xhr.status < 300) {
        emitProgress(onProgress, 1, 1);
        resolve(xhr.response as ArrayBuffer);
      } else if (xhr.status === 429) {
        reject(new TranscriptionLimitError());
      } else {
        reject(
          new Error(
            `Backend returned ${xhr.status} ${xhr.statusText || ''}`.trim(),
          ),
        );
      }
    };
    xhr.onerror = () => {
      stopTweening();
      reject(new Error('Network error contacting transcription backend'));
    };
    xhr.onabort = () => {
      stopTweening();
      reject(new Error('Upload aborted'));
    };

    xhr.send(form);
  });
}

/* -------------------------------- Mock path ------------------------------- */

async function mockTranscribe(
  instrument: InstrumentType,
  onProgress?: (p: number, s: string) => void,
): Promise<TranscriptionResult> {
  const perStage = 900;
  for (let i = 0; i < STAGES.length; i++) {
    onProgress?.(i / STAGES.length, STAGES[i]);
    await wait(perStage);
  }
  onProgress?.(1, 'Complete');

  const midi = generateMockMidi(instrument);
  return {
    midi,
    bpm: midi.header.tempos[0]?.bpm ?? 120,
    timeSignature:
      (midi.header.timeSignatures[0]?.timeSignature as [number, number]) ?? [
        4,
        4,
      ],
    instrumentType: instrument,
    real: false,
  };
}

/* ------------------------------ progress helper --------------------------- */

function emitProgress(
  onProgress: TranscribeOptions['onProgress'],
  stageIdx: number,
  fracWithin: number,
): void {
  if (!onProgress) return;
  const clamped = Math.max(0, Math.min(1, fracWithin));
  const overall = (stageIdx + clamped) / STAGES.length;
  onProgress(Math.min(overall, 0.99), STAGES[stageIdx]);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
