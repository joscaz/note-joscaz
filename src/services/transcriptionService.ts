/**
 * Fully-client-side transcription pipeline powered by onnxruntime-web.
 *
 * Pipeline:
 *   File                                     (browser <input type=file>)
 *     -> AudioContext.decodeAudioData         (audioPrep)
 *     -> OfflineAudioContext resample to 16k  (audioPrep)
 *     -> chunked InferenceSession.run         (chunker)
 *     -> NMS peak picking + velocity gather   (decoder)
 *     -> @tonejs/midi Midi object             (midiBuilder)
 *
 * The ONNX graph itself bakes in `TorchWavToLogmel`, so the browser just
 * feeds raw 16 kHz mono samples and gets `(onsets, velocities)` back — no
 * STFT/mel port on our side. See `my-own-mt3/export_onnx.py` for the
 * Python export script, and `public/models/README.md` for where the
 * `.onnx` files live.
 *
 * Demo/fallback: if no `file` is provided we return the mock MIDI so the
 * landing-page teaser still animates end-to-end.
 */

import { Midi } from '@tonejs/midi';
import type { InstrumentType } from '../utils/noteColors';
import { generateMockMidi } from '../utils/mockMidi';

import { fileToMono16k, audioBufferToMono16k } from './onnx/audioPrep';
import { getSession, type LoadProgressCallback } from './onnx/session';
import { runChunked } from './onnx/chunker';
import {
  decodeNms,
  GUITAR_DECODE_OPTIONS,
  PIANO_DECODE_OPTIONS,
  type DecodeOptions,
} from './onnx/decoder';
import { buildMidi } from './onnx/midiBuilder';

/**
 * Per-instrument decoder presets. These mirror the two reference scripts under
 * `InsiderFM_Services/apps/audio-transcription-model/instruments/<name>/inference.py`:
 *
 * - **piano**: Gaussian-blurred probs + equal-to-max NMS + 3-frame velocity mean.
 * - **guitar**: raw probs + strict local-max peaks + single-frame velocity read.
 */
const DECODE_OPTIONS_BY_INSTRUMENT: Record<InstrumentType, DecodeOptions> = {
  piano: PIANO_DECODE_OPTIONS,
  guitar: GUITAR_DECODE_OPTIONS,
};

export interface TranscriptionResult {
  midi: Midi;
  bpm: number;
  timeSignature: [number, number];
  instrumentType: InstrumentType;
  /** `true` if the result came from the real ONNX model, `false` if mock. */
  real: boolean;
}

export interface TranscribeOptions {
  /** Called with a 0..1 progress value so the UI can drive its progress bar. */
  onProgress?: (progress: number, stage: string) => void;
  /** Called while the model `.onnx` file is downloading (first run only). */
  onModelLoad?: LoadProgressCallback;
  /** Original audio file — required for real inference. */
  file?: File;
}

const STAGES = [
  'Decoding audio',
  'Loading model',
  'Running model',
  'Picking peaks',
  'Building MIDI',
] as const;

export async function transcribe(
  audioBuffer: AudioBuffer | null,
  instrument: InstrumentType,
  opts: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const { onProgress, onModelLoad, file } = opts;

  if (!file && !audioBuffer) {
    // Pure demo path: staged animation + mock MIDI.
    return mockTranscribe(instrument, onProgress);
  }

  try {
    // --- 1. Audio prep --------------------------------------------------
    emitProgress(onProgress, 0, 0);
    const wave = file
      ? await fileToMono16k(file)
      : await audioBufferToMono16k(audioBuffer as AudioBuffer);
    emitProgress(onProgress, 0, 1);

    // --- 2. Session (first-run download) --------------------------------
    emitProgress(onProgress, 1, 0);
    const session = await getSession(instrument, (status) => {
      onModelLoad?.(status);
      emitProgress(onProgress, 1, status.progress);
    });
    emitProgress(onProgress, 1, 1);

    // --- 3. Inference ---------------------------------------------------
    const { onsets, velocities, frames, framePeriodSec } = await runChunked(
      session,
      wave,
      (p) => emitProgress(onProgress, 2, p),
    );

    // --- 4. Decode ------------------------------------------------------
    emitProgress(onProgress, 3, 0);
    const events = decodeNms(
      onsets,
      velocities,
      frames,
      DECODE_OPTIONS_BY_INSTRUMENT[instrument],
    );
    emitProgress(onProgress, 3, 1);

    // --- 5. MIDI --------------------------------------------------------
    emitProgress(onProgress, 4, 0);
    const midi = buildMidi(events, framePeriodSec, instrument);
    onProgress?.(1, 'Complete');

    return {
      midi,
      bpm: midi.header.tempos[0]?.bpm ?? 120,
      timeSignature:
        (midi.header.timeSignatures[0]?.timeSignature as [number, number]) ?? [4, 4],
      instrumentType: instrument,
      real: true,
    };
  } catch (err) {
    // Model missing / browser missing WebAssembly / etc. — fall back so the
    // demo never dead-ends.
    console.warn(
      '[NoteForge] ONNX transcription failed, falling back to mock:',
      err,
    );
    return mockTranscribe(instrument, onProgress);
  }
}

/* -------------------------------- Mock path -------------------------------- */

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
      (midi.header.timeSignatures[0]?.timeSignature as [number, number]) ?? [4, 4],
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

export function getPipelineStages(): readonly string[] {
  return STAGES;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
