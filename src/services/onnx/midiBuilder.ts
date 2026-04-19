/**
 * Build a `@tonejs/midi` `Midi` object from decoded `NoteEvent`s.
 *
 * The model only emits onsets — it doesn't know when a note ends. We
 * synthesize note durations the same way the Python backend did:
 * each note's duration extends until the next onset on the same pitch,
 * clamped to `[MIN_DURATION_SEC, MAX_DURATION_SEC]`. The final note of
 * each pitch uses `DEFAULT_DURATION_SEC`. This mirrors the logic that
 * used to live as `repairDurations` in `transcriptionService.ts`.
 */

import { Midi } from '@tonejs/midi';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from './decoder';

/** 0 == MIDI 21 (A0). Matches `PIANO_MIDI_RANGE = (21, 109)` in ov_piano. */
const KEY_OFFSET = 21;

const DEFAULT_DURATION_SEC = 0.35;
const MAX_DURATION_SEC = 2.0;

/**
 * Per-instrument minimum duration behavior, mirroring the two InsiderFM
 * scripts under `apps/audio-transcription-model/instruments/<name>/inference.py`.
 *
 * - **piano**: `MIN_DURATION_SEC = 0.08`, `mode: 'clamp'` — short notes are
 *   stretched up to 80 ms (matches the legacy FastAPI `repairDurations`).
 * - **guitar**: `MIN_DURATION_SEC = 0.05`, `mode: 'drop'` — notes shorter
 *   than 50 ms are discarded outright, matching the guitar script's
 *   `if (nextOnset - onset) < 0.05: continue`.
 */
const MIN_DURATION: Record<
  InstrumentType,
  { seconds: number; mode: 'clamp' | 'drop' }
> = {
  piano: { seconds: 0.08, mode: 'clamp' },
  guitar: { seconds: 0.05, mode: 'drop' },
};

// General MIDI program numbers used by the FastAPI backend for each
// instrument, kept consistent so exported .mid files render the same way
// in DAWs that the backend did.
const PROGRAM: Record<InstrumentType, number> = {
  piano: 0, // Acoustic Grand Piano
  guitar: 25, // Acoustic Guitar (Steel)
};

const TRACK_NAME: Record<InstrumentType, string> = {
  piano: 'Piano',
  guitar: 'Guitar',
};

export interface BuildMidiOptions {
  bpm?: number;
  timeSignature?: [number, number];
}

export function buildMidi(
  events: NoteEvent[],
  framePeriodSec: number,
  instrument: InstrumentType,
  opts: BuildMidiOptions = {},
): Midi {
  const bpm = opts.bpm ?? 120;
  const ts = opts.timeSignature ?? [4, 4];

  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: ts, measures: 0 }];

  const track = midi.addTrack();
  track.name = TRACK_NAME[instrument];
  track.instrument.number = PROGRAM[instrument];

  if (events.length === 0) return midi;

  // Sort once by (time, pitch) and bucket by pitch so we can look forward to
  // the next same-pitch onset to synthesize duration.
  const sorted = [...events].sort(
    (a, b) => a.tIdx - b.tIdx || a.key - b.key,
  );
  const byPitch = new Map<number, NoteEvent[]>();
  for (const ev of sorted) {
    const pitch = ev.key + KEY_OFFSET;
    const bucket = byPitch.get(pitch);
    if (bucket) bucket.push(ev);
    else byPitch.set(pitch, [ev]);
  }

  const minDur = MIN_DURATION[instrument];

  for (const [pitch, bucket] of byPitch) {
    for (let i = 0; i < bucket.length; i++) {
      const ev = bucket[i];
      const onsetSec = ev.tIdx * framePeriodSec;
      const nextOnsetSec =
        i + 1 < bucket.length
          ? bucket[i + 1].tIdx * framePeriodSec - 0.005 // avoid exact overlap
          : onsetSec + DEFAULT_DURATION_SEC;
      const rawDuration = nextOnsetSec - onsetSec;

      let duration: number;
      if (rawDuration < minDur.seconds) {
        if (minDur.mode === 'drop') continue;
        duration = minDur.seconds;
      } else {
        duration = Math.min(MAX_DURATION_SEC, rawDuration);
      }

      track.addNote({
        midi: pitch,
        time: onsetSec,
        duration,
        velocity: clamp01(ev.vel),
      });
    }
  }

  return midi;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
