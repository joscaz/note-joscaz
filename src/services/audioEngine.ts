import * as Tone from 'tone';
import type { Midi } from '@tonejs/midi';
import type { InstrumentType } from '../utils/noteColors';

export type AudioSource = 'mp3' | 'synth' | 'both';

type NoteEvent = {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
};

type ActiveNotesListener = (activeMidis: Set<number>, transportTime: number) => void;

/**
 * Single audio engine that drives both the original MP3 (Tone.Player) and the
 * synthesized transcription (Tone.Sampler / PolySynth) off of a shared
 * Tone.Transport. Source selection crossfades two Gain nodes to avoid clicks.
 *
 * The engine also maintains the canonical Set<number> of currently-sounding
 * MIDI pitches (driven by Transport-scheduled events) for the piano keyboard
 * highlight. This is the source of truth; the PianoRoll visuals derive from
 * Transport.seconds directly so they stay perfectly in sync with this Set.
 */
class AudioEngine {
  private mp3Player: Tone.Player | null = null;
  private mp3Gain: Tone.Gain;
  private synthGain: Tone.Gain;
  private masterVolume: Tone.Volume;

  private pianoSampler: Tone.Sampler | null = null;
  private guitarSynth: Tone.PolySynth | null = null;

  private scheduledIds: number[] = [];
  private midiNotes: NoteEvent[] = [];
  private activeMidis = new Set<number>();
  private listeners = new Set<ActiveNotesListener>();
  private activeTickerId: number | null = null;

  private source: AudioSource = 'synth';
  private _duration = 0;
  private _loop = false;
  private _ready = false;
  private _readyPromise: Promise<void> | null = null;

  constructor() {
    this.masterVolume = new Tone.Volume(-4).toDestination();
    this.mp3Gain = new Tone.Gain(0).connect(this.masterVolume);
    this.synthGain = new Tone.Gain(1).connect(this.masterVolume);
  }

  /** Must be called from a user gesture (click) before any playback. */
  async ensureStarted(): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  async loadInstruments(): Promise<void> {
    if (this._ready) return;
    if (this._readyPromise) return this._readyPromise;

    this._readyPromise = (async () => {
      // Piano sampler using Tone.js's hosted Salamander Grand samples.
      this.pianoSampler = new Tone.Sampler({
        urls: {
          A1: 'A1.mp3',
          A2: 'A2.mp3',
          A3: 'A3.mp3',
          A4: 'A4.mp3',
          A5: 'A5.mp3',
          A6: 'A6.mp3',
          C2: 'C2.mp3',
          C3: 'C3.mp3',
          C4: 'C4.mp3',
          C5: 'C5.mp3',
          C6: 'C6.mp3',
          C7: 'C7.mp3',
        },
        release: 1,
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
      }).connect(this.synthGain);

      // Guitar-ish tone via FM synth with distortion for a power-chord feel.
      const guitarSynth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2.4,
        modulationIndex: 6,
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2 },
        modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.2 },
      });
      const dist = new Tone.Distortion(0.35);
      const chorus = new Tone.Chorus(3, 1.5, 0.3).start();
      guitarSynth.chain(dist, chorus, this.synthGain);
      this.guitarSynth = guitarSynth;

      await Tone.loaded();
      this._ready = true;
    })();

    return this._readyPromise;
  }

  /** Load the original MP3 into a Tone.Player on Transport. */
  async loadAudio(buffer: AudioBuffer): Promise<void> {
    if (this.mp3Player) {
      this.mp3Player.dispose();
      this.mp3Player = null;
    }
    const toneBuffer = new Tone.ToneAudioBuffer(buffer);
    const player = new Tone.Player(toneBuffer).sync().start(0);
    player.connect(this.mp3Gain);
    this.mp3Player = player;
  }

  /**
   * Schedule every note from the Midi onto Transport. Rebuilds scheduling if
   * called again (e.g. after re-transcription or instrument change).
   */
  loadMidi(midi: Midi, instrument: InstrumentType): void {
    this.clearScheduled();

    const notes: NoteEvent[] = [];
    let maxEnd = 0;
    for (const track of midi.tracks) {
      for (const n of track.notes) {
        notes.push({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
        const end = n.time + n.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    notes.sort((a, b) => a.time - b.time);
    this.midiNotes = notes;
    this._duration = maxEnd + 0.5;

    Tone.getTransport().loop = this._loop;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = this._duration;

    // Schedule synth note triggers.
    const instrumentRef: Tone.Sampler | Tone.PolySynth | null =
      instrument === 'piano' ? this.pianoSampler : this.guitarSynth;
    if (!instrumentRef) return;

    for (const n of notes) {
      const id = Tone.getTransport().schedule((time) => {
        try {
          instrumentRef.triggerAttackRelease(
            Tone.Frequency(n.midi, 'midi').toNote(),
            Math.max(0.02, n.duration),
            time,
            n.velocity,
          );
        } catch {
          // Some samplers throw if asked before loaded; ignore gracefully.
        }
      }, n.time);
      this.scheduledIds.push(id);
    }
  }

  /** Subscribe to active-note updates (for keyboard glow). */
  onActiveNotes(listener: ActiveNotesListener): () => void {
    this.listeners.add(listener);
    if (this.activeTickerId === null) {
      // Driven off a lightweight rAF so it matches the visualizer loop.
      const tick = () => {
        this.updateActiveNotes();
        this.activeTickerId = requestAnimationFrame(tick);
      };
      this.activeTickerId = requestAnimationFrame(tick);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.activeTickerId !== null) {
        cancelAnimationFrame(this.activeTickerId);
        this.activeTickerId = null;
      }
    };
  }

  private updateActiveNotes(): void {
    const t = Tone.getTransport().seconds;
    const active = this.activeMidis;
    active.clear();
    for (const n of this.midiNotes) {
      if (n.time > t) break;
      if (n.time + n.duration >= t) {
        active.add(n.midi);
      }
    }
    for (const l of this.listeners) l(active, t);
  }

  /** A/B source switch with a short gain ramp to avoid clicks. */
  setSource(source: AudioSource): void {
    this.source = source;
    const ramp = 0.06;
    const now = Tone.now();
    const mp3 = source === 'mp3' || source === 'both' ? 1 : 0;
    const synth = source === 'synth' || source === 'both' ? 1 : 0;
    this.mp3Gain.gain.cancelScheduledValues(now);
    this.synthGain.gain.cancelScheduledValues(now);
    this.mp3Gain.gain.rampTo(mp3, ramp);
    this.synthGain.gain.rampTo(synth, ramp);
  }
  getSource(): AudioSource { return this.source; }

  setVolume(linear: number): void {
    const clamped = Math.max(0, Math.min(1, linear));
    const db = clamped === 0 ? -60 : 20 * Math.log10(clamped);
    this.masterVolume.volume.rampTo(db, 0.05);
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.rampTo(bpm, 0.05);
  }

  setLoop(loop: boolean): void {
    this._loop = loop;
    Tone.getTransport().loop = loop;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = this._duration;
  }

  async play(): Promise<void> {
    await this.ensureStarted();
    if (this.mp3Player && this.mp3Player.state !== 'started') {
      // Player is .sync()'d so transport.start triggers it.
    }
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(this._duration, seconds));
    Tone.getTransport().seconds = clamped;
  }

  seekBy(delta: number): void {
    this.seek(Tone.getTransport().seconds + delta);
  }

  restart(): void {
    Tone.getTransport().seconds = 0;
  }

  get duration(): number { return this._duration; }
  get currentTime(): number { return Tone.getTransport().seconds; }
  get isPlaying(): boolean { return Tone.getTransport().state === 'started'; }
  get loop(): boolean { return this._loop; }
  get notes(): readonly NoteEvent[] { return this.midiNotes; }

  private clearScheduled(): void {
    for (const id of this.scheduledIds) {
      Tone.getTransport().clear(id);
    }
    this.scheduledIds = [];
    // Cancel any still-ringing notes.
    if (this.pianoSampler) this.pianoSampler.releaseAll();
    if (this.guitarSynth) this.guitarSynth.releaseAll();
  }

  dispose(): void {
    this.clearScheduled();
    this.mp3Player?.dispose();
    this.pianoSampler?.dispose();
    this.guitarSynth?.dispose();
    this.mp3Gain.dispose();
    this.synthGain.dispose();
    this.masterVolume.dispose();
    if (this.activeTickerId !== null) cancelAnimationFrame(this.activeTickerId);
  }
}

export const audioEngine = new AudioEngine();
export type { NoteEvent };
