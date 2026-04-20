import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { audioEngine, type AudioSource } from '../services/audioEngine';

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
  useEffect(() => {
    const tick = () => {
      setCurrentTime(Tone.getTransport().seconds);
      setIsPlaying(Tone.getTransport().state === 'started');
      setDuration(audioEngine.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
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
  const pause = useCallback(() => { audioEngine.pause(); }, []);
  const toggle = useCallback(async () => {
    if (audioEngine.isPlaying) audioEngine.pause();
    else await audioEngine.play();
  }, []);
  const stop = useCallback(() => { audioEngine.stop(); }, []);
  const restart = useCallback(() => { audioEngine.restart(); }, []);
  const seek = useCallback((seconds: number) => { audioEngine.seek(seconds); }, []);
  const seekBy = useCallback((delta: number) => { audioEngine.seekBy(delta); }, []);
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
