import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { audioEngine, type AudioSource } from '../services/audioEngine';
import { useGraphicsStore } from '../services/graphicsStore';

export interface UseAudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  volume: number;
  loop: boolean;
  source: AudioSource;
  pianoSustain: boolean;
}

/**
 * Thin React-facing wrapper around the singleton audioEngine. Subscribes to
 * Transport time on a rAF loop and provides imperative controls.
 */
export function useAudioPlayer(): UseAudioPlayerState & {
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  stop: () => void;
  restart: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setBpm: (bpm: number) => void;
  setVolume: (v: number) => void;
  setLoop: (loop: boolean) => void;
  setSource: (s: AudioSource) => void;
  setPianoSustain: (on: boolean) => void;
} {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(audioEngine.duration);
  const [bpm, setBpmState] = useState(() => Tone.getTransport().bpm.value);
  const [volume, setVolumeState] = useState(0.85);
  const [loop, setLoopState] = useState(audioEngine.loop);
  const [source, setSourceState] = useState<AudioSource>(audioEngine.getSource());
  const [pianoSustain, setPianoSustainState] = useState<boolean>(audioEngine.pianoSustain);

  const rafRef = useRef<number | null>(null);
  // Refs for throttle + change-gate on cheap but frequent state pushes.
  const lastPushRef = useRef<number>(0);      // ms timestamp of last setCurrentTime call
  const prevIsPlayingRef = useRef<boolean>(false);
  const prevDurationRef = useRef<number>(audioEngine.duration);

  // Sync-time rAF — runs only while transport is started.
  // Gated by audioEngine.onStateChange so it starts on play and cancels on
  // pause/stop. On cancel one final (un-throttled) push snaps the scrubber to
  // the exact paused position.
  useEffect(() => {
    const startRaf = () => {
      if (rafRef.current !== null) return; // already running
      const tick = (now: number) => {
        // Throttle to ~50 ms (≈20 fps) — imperceptible on a scrubber.
        if (now - lastPushRef.current >= 50) {
          lastPushRef.current = now;
          setCurrentTime(Tone.getTransport().seconds);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const stopRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Snap scrubber to exact paused/stopped position (bypass throttle).
      setCurrentTime(Tone.getTransport().seconds);
    };

    // Mirror transport state immediately on mount, then whenever it changes.
    const handleStateChange = () => {
      const playing = Tone.getTransport().state === 'started';
      // Change-gate: avoid redundant setState calls when state is the same.
      if (playing !== prevIsPlayingRef.current) {
        prevIsPlayingRef.current = playing;
        setIsPlaying(playing);
      }
      const dur = audioEngine.duration;
      if (dur !== prevDurationRef.current) {
        prevDurationRef.current = dur;
        setDuration(dur);
      }
      if (playing) startRaf();
      else stopRaf();
    };

    // Subscribe to engine state to start/stop the rAF on play/pause/stop.
    const unsubscribe = audioEngine.onStateChange(handleStateChange);

    // Run once on mount to set initial state (transport may already be started
    // if the component re-mounts mid-playback, e.g. during hot-reload).
    handleStateChange();

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Track engine state so that any direct engine mutation (e.g. App.tsx
  // setting the source to 'both' after a successful transcription, or
  // pushing a new BPM from the model) stays reflected in the UI. Without
  // this subscription, the A/B switch could display "MIDI" while the
  // engine is actually mixing both tracks — the exact symptom of the
  // "I selected MIDI but hear A/B" bug.
  useEffect(() => {
    const sync = () => {
      setSourceState(audioEngine.getSource());
      setBpmState(Tone.getTransport().bpm.value);
      setLoopState(audioEngine.loop);
      setPianoSustainState(audioEngine.pianoSustain);
    };
    sync();
    return audioEngine.onStateChange(sync);
  }, []);

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  const play = useCallback(async () => { await audioEngine.play(); }, []);
  const pause = useCallback(() => {
    audioEngine.pause();
    // Snap scrubber immediately on pause (bypass 50ms throttle) and request
    // one scene repaint so FallingBars redraws at the paused position.
    setCurrentTime(audioEngine.currentTime);
    useGraphicsStore.getState().bumpRepaint();
  }, []);
  // Route through the hook's own pause()/play() (not the engine directly) so
  // toggle inherits pause()'s snap + bumpRepaint(). toggle is the primary pause
  // action (main play button + Space), so under frameloop='demand' it must land
  // the scene on the exact paused position like the pause button does.
  const toggle = useCallback(async () => {
    if (audioEngine.isPlaying) pause();
    else await play();
  }, [pause, play]);
  const stop = useCallback(() => {
    audioEngine.stop();
    setCurrentTime(audioEngine.currentTime);
    useGraphicsStore.getState().bumpRepaint();
  }, []);
  // Snap scrubber immediately (bypass 50ms throttle) and request one scene
  // repaint so FallingBars/scrubber redraw at the new position while paused —
  // under frameloop='demand' the rAF is off when paused, so without bumpRepaint
  // the scene would stay frozen at the old position.
  const restart = useCallback(() => {
    audioEngine.restart();
    setCurrentTime(audioEngine.currentTime);
    useGraphicsStore.getState().bumpRepaint();
  }, []);
  const seek = useCallback((seconds: number) => {
    audioEngine.seek(seconds);
    setCurrentTime(audioEngine.currentTime);
    useGraphicsStore.getState().bumpRepaint();
  }, []);
  const seekBy = useCallback((delta: number) => {
    audioEngine.seekBy(delta);
    setCurrentTime(audioEngine.currentTime);
    useGraphicsStore.getState().bumpRepaint();
  }, []);
  // These setters write to the engine; the onStateChange subscription above
  // then pulls the new value back into React state, so we don't need to set
  // local state here too (and risk drifting from the engine's truth).
  const setBpm = useCallback((v: number) => { audioEngine.setBpm(v); }, []);
  const setVolume = useCallback((v: number) => { audioEngine.setVolume(v); setVolumeState(v); }, []);
  const setLoop = useCallback((l: boolean) => { audioEngine.setLoop(l); }, []);
  const setSource = useCallback((s: AudioSource) => { audioEngine.setSource(s); }, []);
  const setPianoSustain = useCallback((on: boolean) => { audioEngine.setPianoSustain(on); }, []);

  return {
    isPlaying, currentTime, duration, bpm, volume, loop, source, pianoSustain,
    play, pause, toggle, stop, restart, seek, seekBy, setBpm, setVolume, setLoop, setSource, setPianoSustain,
  };
}
