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
} {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(audioEngine.duration);
  const [bpm, setBpmState] = useState(() => Tone.getTransport().bpm.value);
  const [volume, setVolumeState] = useState(0.85);
  const [loop, setLoopState] = useState(audioEngine.loop);
  const [source, setSourceState] = useState<AudioSource>(audioEngine.getSource());

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

  // Apply initial volume once.
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
  const setBpm = useCallback((v: number) => { audioEngine.setBpm(v); setBpmState(v); }, []);
  const setVolume = useCallback((v: number) => { audioEngine.setVolume(v); setVolumeState(v); }, []);
  const setLoop = useCallback((l: boolean) => { audioEngine.setLoop(l); setLoopState(l); }, []);
  const setSource = useCallback((s: AudioSource) => { audioEngine.setSource(s); setSourceState(s); }, []);

  return {
    isPlaying, currentTime, duration, bpm, volume, loop, source,
    play, pause, toggle, stop, restart, seek, seekBy, setBpm, setVolume, setLoop, setSource,
  };
}
