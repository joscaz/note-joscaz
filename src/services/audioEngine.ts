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
type StateListener = () => void;

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
  private guitarSampler: Tone.Sampler | null = null;

  private scheduledIds: number[] = [];
  private midiNotes: NoteEvent[] = [];
  private activeMidis = new Set<number>();
  private listeners = new Set<ActiveNotesListener>();
  private stateListeners = new Set<StateListener>();
  private activeTickerId: number | null = null;

  private source: AudioSource = 'synth';
  private _duration = 0;
  private _loop = false;
  private _ready = false;
  private _readyPromise: Promise<void> | null = null;
  private _scheduleBpm = 120;
  // Precomputed at loadMidi time — the longest single note duration in the
  // current piece. Used as the bisect window in updateActiveNotes so the scan
  // starts at (t - _maxNoteDuration) rather than index 0. O(log n + k) instead
  // of O(n) per tick.
  private _maxNoteDuration = 0;
  // Transport seconds at the last scan. Used to skip redundant scans while
  // paused (state unchanged → notes unchanged → no emit needed).
  private _lastScanT = -1;

  // Piano-only: when true, each note is triggered as pure `triggerAttack` and
  // the Salamander sample decays naturally (model-truthful, onset-only). When
  // false, each note is `triggerAttackRelease`d with the short cosmetic
  // duration (clampPianoDurations) for a staccato / sustain-pedal-off feel.
  // Read at trigger time, not at schedule time, so the toggle takes effect
  // for both future notes and mid-playback state changes.
  private _pianoSustain = true;

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

      // Real acoustic-guitar samples (Nicholas Brosowsky's `tonejs-instruments`
      // CDN). This matches the backend's GM program 25 "Acoustic Guitar (Steel)"
      // and — crucially — gives correct timbre across the guitar's actual pitch
      // range. The previous FM-synth-plus-distortion chain sounded roughly
      // right on mid-register power chords but wrong on low notes (FM doesn't
      // model a plucked string's partials or body resonance), and stacked up
      // IMD on dense transcriptions. A sampler has none of those problems —
      // each pitch is a real recorded guitar note, pitch-shifted to fill the
      // gaps between the sampled roots.
      //
      // Root set picked to span E2 (low E on a 6-string) through A4 at ~major
      // third spacing so the largest pitch-shift is <= 2 semitones in either
      // direction — inaudible on acoustic guitar timbre.
      this.guitarSampler = new Tone.Sampler({
        urls: {
          E2: 'E2.mp3',
          A2: 'A2.mp3',
          D3: 'D3.mp3',
          G3: 'G3.mp3',
          C4: 'C4.mp3',
          E4: 'E4.mp3',
          A4: 'A4.mp3',
        },
        release: 0.8,
        baseUrl:
          'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/',
      }).connect(new Tone.Limiter(-3).connect(this.synthGain));

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
    this._scheduleBpm = Tone.getTransport().bpm.value;
    this.clearScheduled();

    const notes: NoteEvent[] = [];
    let maxEnd = 0;
    let maxDuration = 0;
    for (const track of midi.tracks) {
      for (const n of track.notes) {
        notes.push({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
        const end = n.time + n.duration;
        if (end > maxEnd) maxEnd = end;
        if (n.duration > maxDuration) maxDuration = n.duration;
      }
    }
    notes.sort((a, b) => a.time - b.time);
    this.midiNotes = notes;
    this._duration = maxEnd + 0.5;

    // Longest note duration = the bisect window in updateActiveNotes, tracked as
    // a running max in the build loop above. NOT Math.max(...notes.map(...)):
    // spreading a large array as function arguments blows V8's argument-count
    // limit and throws "Maximum call stack size exceeded" on dense orchestral
    // MIDIs (tens of thousands of notes). A running max has no such ceiling and
    // skips the extra pass + intermediate array. Empty piece → 0.
    this._maxNoteDuration = maxDuration;
    // Reset scan cursor so a stale value from the previous piece doesn't
    // cause updateActiveNotes to skip the first tick of the new piece.
    this._lastScanT = -1;

    Tone.getTransport().loop = this._loop;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = this._duration;

    // Auto-pause at the end of the piece when not looping. Without this the
    // Transport stays state==='started' past the last note, so isPlaying never
    // flips false and the demand-mode FrameDriver keeps invalidating at fpsCap
    // with nothing on screen changing — the GPU stays hot on a finished song.
    // pause() (not stop()) leaves the scrubber + scene coherent at the final
    // frame and flips isPlaying false, which shuts the FrameDriver rAF off.
    // The _loop guard is read at call time, so a looping piece never auto-pauses.
    // Tracked in scheduledIds so the next loadMidi()/clearScheduled() clears it.
    const endStopId = Tone.getTransport().scheduleOnce(() => {
      if (!this._loop) this.pause();
    }, this._duration);
    this.scheduledIds.push(endStopId);

    // Schedule synth note triggers.
    //
    // Piano uses pure `triggerAttack` — no duration, no release call. The
    // Onsets & Velocities model only produces onsets (no note_off), so any
    // duration we'd pass is fiction. Letting the Salamander sample play to
    // its own natural tail is exactly how the reference CLI `.mid` sounds
    // in a DAW with a piano patch, and it's sonically truthful to the model.
    //
    // Guitar still uses `triggerAttackRelease` because the guitar backend
    // computes real, meaningful durations (gap-to-next-same-pitch, capped at
    // 2 s, sub-50 ms squeak removal) that match the CLI output.
    const instrumentRef: Tone.Sampler | null =
      instrument === 'piano' ? this.pianoSampler : this.guitarSampler;
    if (!instrumentRef) return;

    const isPiano = instrument === 'piano';
    for (const n of notes) {
      const id = Tone.getTransport().schedule((time) => {
        try {
          const note = Tone.Frequency(n.midi, 'midi').toNote();
          if (isPiano && this._pianoSustain) {
            // Sustain on: pure onset, natural sample decay.
            instrumentRef.triggerAttack(note, time, n.velocity);
          } else {
            // Sustain off (piano) *or* guitar: short, bounded release. For
            // piano this is the UX-clamped cosmetic duration (≤ 0.30 s), for
            // guitar it's the backend's real smart-sustain duration.
            instrumentRef.triggerAttackRelease(
              note,
              Math.max(0.02, n.duration),
              time,
              n.velocity,
            );
          }
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
    const transport = Tone.getTransport();
    const t = transport.seconds;

    // (a) Transport stopped or paused with no active notes → nothing to clear,
    //     skip all work. If there ARE active notes, we need to clear them once
    //     so the piano glow and particles don't stay lit after pause/stop.
    if (transport.state !== 'started') {
      if (this.activeMidis.size > 0) {
        this.activeMidis.clear();
        // Emit once so every listener (piano glow, particles) clears immediately.
        for (const l of this.listeners) l(this.activeMidis, t);
      }
      // (b) Paused and position unchanged since last scan → no notes moved in or
      //     out of the active window, so skip the bisect entirely. This handles
      //     the steady-state paused case (no seek, no loop jump).
      //     We check this AFTER the clear-and-emit path above so a freshly
      //     paused transport always emits the empty set before idling.
      this._lastScanT = t;
      return;
    }

    // (b) Transport started but position hasn't changed (e.g. clock jitter on
    //     the very first tick at t=0 with two rapid rAF calls). Skip redundant
    //     scan while playing so we don't churn the Set and emit unchanged data.
    if (t === this._lastScanT) return;
    this._lastScanT = t;

    // (c) Bisect: find the first note whose window can still overlap t.
    //     Any note with note.time > t has not started yet → break.
    //     Any note with note.time + note.duration < t has already ended → skip.
    //     We start the scan at the first index where note.time >= t - maxDuration,
    //     so notes that started long before t but have already ended are skipped
    //     entirely, keeping the inner loop bounded by concurrent active notes (k)
    //     rather than all past notes (n).
    const windowStart = t - this._maxNoteDuration;

    // Binary search for the lower bound: first index where note.time >= windowStart.
    let lo = 0;
    let hi = this.midiNotes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.midiNotes[mid].time < windowStart) lo = mid + 1;
      else hi = mid;
    }
    const startIdx = lo;

    // Rebuild the active set from the bisect window.
    const active = this.activeMidis;
    active.clear();
    for (let i = startIdx; i < this.midiNotes.length; i++) {
      const n = this.midiNotes[i];
      if (n.time > t) break;           // notes ahead of playhead — done
      if (n.time + n.duration >= t) {
        active.add(n.midi);
      }
    }

    for (const l of this.listeners) l(active, t);
  }

  /** A/B source switch with a short gain ramp to avoid clicks. */
  setSource(source: AudioSource): void {
    if (this.source === source) {
      // Still re-apply gains in case something (e.g. a prior reload) left
      // them inconsistent, but don't re-notify listeners unnecessarily.
      this.applySourceGains(source);
      return;
    }
    this.source = source;
    this.applySourceGains(source);
    this.emitState();
  }

  private applySourceGains(source: AudioSource): void {
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
    Tone.getTransport().bpm.value = bpm;
    this.emitState();
  }

  setLoop(loop: boolean): void {
    this._loop = loop;
    Tone.getTransport().loop = loop;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = this._duration;
    this.emitState();
  }

  /**
   * Piano-only. When turning sustain *off* mid-playback we also release any
   * currently-ringing voices so the existing tail doesn't linger 3–5 s after
   * the user flipped the switch. Future notes read `_pianoSustain` at their
   * own trigger time.
   */
  setPianoSustain(on: boolean): void {
    if (this._pianoSustain === on) return;
    const wasOn = this._pianoSustain;
    this._pianoSustain = on;
    if (wasOn && !on && this.pianoSampler) {
      this.pianoSampler.releaseAll();
    }
    this.emitState();
  }
  get pianoSustain(): boolean { return this._pianoSustain; }

  /**
   * Subscribe to engine state changes (source, bpm, loop, pianoSustain). The
   * hook layer listens to this so React state always tracks the engine, even
   * when app-level code (e.g. post-transcription in App.tsx) mutates the
   * engine directly. This is what keeps the A/B switch UI honest — without
   * it, the button can say "MIDI" while gains are actually on A/B.
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  private emitState(): void {
    for (const l of this.stateListeners) l();
  }

  async play(): Promise<void> {
    await this.ensureStarted();
    if (this.mp3Player && this.mp3Player.state !== 'started') {
      // Player is .sync()'d so transport.start triggers it.
    }
    Tone.getTransport().start();
    // Notify subscribers so useAudioPlayer can start its rAF immediately
    // instead of waiting for the next periodic poll.
    this.emitState();
  }

  pause(): void {
    Tone.getTransport().pause();
    // Notify subscribers so useAudioPlayer can cancel its rAF and snap the
    // scrubber to the exact paused position without a polling round-trip.
    this.emitState();
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
    this.emitState();
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(this._duration, seconds));
    Tone.getTransport().seconds = clamped;
    // Notify subscribers so direct engine callers (e.g. App.tsx) keep React
    // state in sync without waiting for a polling round-trip. seekBy() routes
    // through seek(), so it inherits this.
    this.emitState();
  }

  seekBy(delta: number): void {
    this.seek(Tone.getTransport().seconds + delta);
  }

  restart(): void {
    Tone.getTransport().seconds = 0;
    this.emitState();
  }

  get duration(): number { return this._duration; }
  get currentTime(): number { return Tone.getTransport().seconds; }
  get isPlaying(): boolean { return Tone.getTransport().state === 'started'; }
  get loop(): boolean { return this._loop; }
  get notes(): readonly NoteEvent[] { return this.midiNotes; }
  get scheduleBpm(): number { return this._scheduleBpm; }

  private clearScheduled(): void {
    for (const id of this.scheduledIds) {
      Tone.getTransport().clear(id);
    }
    this.scheduledIds = [];
    // Cancel any still-ringing notes.
    if (this.pianoSampler) this.pianoSampler.releaseAll();
    if (this.guitarSampler) this.guitarSampler.releaseAll();
  }

  dispose(): void {
    this.clearScheduled();
    this.mp3Player?.dispose();
    this.pianoSampler?.dispose();
    this.guitarSampler?.dispose();
    this.mp3Gain.dispose();
    this.synthGain.dispose();
    this.masterVolume.dispose();
    if (this.activeTickerId !== null) cancelAnimationFrame(this.activeTickerId);
  }
}

export const audioEngine = new AudioEngine();
export type { NoteEvent };
