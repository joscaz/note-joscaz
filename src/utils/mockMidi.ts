import { Midi } from '@tonejs/midi';
import type { InstrumentType } from './noteColors';

/**
 * Mock MIDI generator. Produces a realistic @tonejs/midi Midi object that
 * the rest of the app consumes exactly like a real transcription result.
 *
 * Piano mode: 32 bars at 120 BPM, Cmaj–Am–F–G with arpeggios and bass.
 * Guitar mode: E5–A5–D5 power-chord riff with palm-mute dynamics.
 */

const BPM = 120;
const BEATS_PER_BAR = 4;
const TOTAL_BARS = 32;
const SECONDS_PER_BEAT = 60 / BPM;
const BAR = BEATS_PER_BAR * SECONDS_PER_BEAT; // 2.0s

function clamp01(v: number): number {
  return Math.max(0.05, Math.min(1, v));
}

export function generateMockMidi(instrument: InstrumentType): Midi {
  const midi = new Midi();
  midi.header.setTempo(BPM);
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: [4, 4], measures: 0 },
  ];

  if (instrument === 'piano') {
    buildPiano(midi);
  } else {
    buildGuitar(midi);
  }

  return midi;
}

/* ------------------------------ PIANO ------------------------------ */

// Cmaj (C4 E4 G4), Am (A3 C4 E4), F (F3 A3 C4), G (G3 B3 D4)
const PIANO_CHORDS: Array<{ name: string; notes: number[]; bass: number }> = [
  { name: 'C',  notes: [60, 64, 67], bass: 48 }, // C3
  { name: 'Am', notes: [57, 60, 64], bass: 45 }, // A2
  { name: 'F',  notes: [53, 57, 60], bass: 41 }, // F2
  { name: 'G',  notes: [55, 59, 62], bass: 43 }, // G2
];

function buildPiano(midi: Midi): void {
  const arpTrack = midi.addTrack();
  arpTrack.name = 'Piano — Arpeggios';
  arpTrack.instrument.number = 0; // Acoustic Grand Piano

  const bassTrack = midi.addTrack();
  bassTrack.name = 'Piano — Bass';
  bassTrack.instrument.number = 0;

  const chordTrack = midi.addTrack();
  chordTrack.name = 'Piano — Chord Hits';
  chordTrack.instrument.number = 0;

  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const chord = PIANO_CHORDS[bar % PIANO_CHORDS.length];
    const barStart = bar * BAR;

    // Arpeggio: 8 eighth notes traversing chord tones up & down with variation.
    const arpPattern = [0, 1, 2, 1, 0, 1, 2, 3]; // pitch index into extended chord
    const extended = [...chord.notes, chord.notes[0] + 12];
    for (let i = 0; i < 8; i++) {
      const beat = i * 0.5; // eighth notes
      const time = barStart + beat * SECONDS_PER_BEAT;
      const pitch = extended[arpPattern[i] % extended.length];
      // Dynamics: accent on beats 1 & 3, ghost on "e" of 2 & 4.
      let vel = 0.55;
      if (i === 0) vel = 0.85;
      else if (i === 4) vel = 0.78;
      else if (i % 2 === 1) vel = 0.45;
      // Tiny humanization.
      vel += (Math.random() - 0.5) * 0.08;
      const duration = 0.48 * SECONDS_PER_BEAT;
      arpTrack.addNote({
        midi: pitch,
        time,
        duration,
        velocity: clamp01(vel),
      });
    }

    // Bass: root on beat 1, fifth on beat 3.
    bassTrack.addNote({
      midi: chord.bass,
      time: barStart,
      duration: 2 * SECONDS_PER_BEAT,
      velocity: 0.88,
    });
    bassTrack.addNote({
      midi: chord.bass + 7,
      time: barStart + 2 * SECONDS_PER_BEAT,
      duration: 2 * SECONDS_PER_BEAT,
      velocity: 0.72,
    });

    // Chord stab on the "and" of beat 2 every other bar for movement.
    if (bar % 2 === 1) {
      const stabTime = barStart + 1.5 * SECONDS_PER_BEAT;
      for (const pitch of chord.notes) {
        chordTrack.addNote({
          midi: pitch + 12,
          time: stabTime,
          duration: 0.5 * SECONDS_PER_BEAT,
          velocity: 0.6 + (Math.random() - 0.5) * 0.1,
        });
      }
    }
  }
}

/* ------------------------------ GUITAR ------------------------------ */

// Power chords: E5 (E2+B2), A5 (A2+E3), D5 (D3+A3). Riff: E E A A D D A E.
const GUITAR_RIFF: Array<{ root: number; fifth: number; octave?: number }> = [
  { root: 40, fifth: 47 }, // E2 + B2
  { root: 40, fifth: 47 },
  { root: 45, fifth: 52 }, // A2 + E3
  { root: 45, fifth: 52 },
  { root: 50, fifth: 57 }, // D3 + A3
  { root: 50, fifth: 57 },
  { root: 45, fifth: 52 },
  { root: 40, fifth: 47 },
];

function buildGuitar(midi: Midi): void {
  const rhythmTrack = midi.addTrack();
  rhythmTrack.name = 'Guitar — Power Chords';
  rhythmTrack.instrument.number = 30; // Distortion Guitar

  const leadTrack = midi.addTrack();
  leadTrack.name = 'Guitar — Lead';
  leadTrack.instrument.number = 29; // Overdriven Guitar

  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const barStart = bar * BAR;

    // Rhythm: 8 eighth notes per bar, palm-muted except on beats 1 & 3.
    for (let i = 0; i < 8; i++) {
      const beat = i * 0.5;
      const time = barStart + beat * SECONDS_PER_BEAT;
      const chord = GUITAR_RIFF[i];
      const isAccent = i === 0 || i === 4;
      const vel = isAccent
        ? 0.92 + (Math.random() - 0.5) * 0.06
        : 0.55 + (Math.random() - 0.5) * 0.12;
      const duration = isAccent
        ? 0.45 * SECONDS_PER_BEAT
        : 0.22 * SECONDS_PER_BEAT; // palm-muted shorter

      rhythmTrack.addNote({
        midi: chord.root,
        time,
        duration,
        velocity: clamp01(vel),
      });
      rhythmTrack.addNote({
        midi: chord.fifth,
        time: time + 0.005,
        duration,
        velocity: clamp01(vel * 0.9),
      });
    }

    // Lead: every 4 bars, a pentatonic lick on top.
    if (bar % 4 === 3) {
      const pentE = [64, 67, 69, 71, 74, 76]; // E minor pentatonic fragment
      for (let i = 0; i < 6; i++) {
        const time = barStart + (i * 0.25) * SECONDS_PER_BEAT;
        leadTrack.addNote({
          midi: pentE[i],
          time,
          duration: 0.24 * SECONDS_PER_BEAT,
          velocity: 0.7 + (Math.random() - 0.5) * 0.1,
        });
      }
      // Bend-like sustain on last note.
      leadTrack.addNote({
        midi: pentE[5],
        time: barStart + 1.75 * SECONDS_PER_BEAT,
        duration: 0.25 * SECONDS_PER_BEAT,
        velocity: 0.85,
      });
    }
  }
}
