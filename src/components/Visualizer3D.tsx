import { useEffect, useMemo, useRef, useState } from 'react';
import type { Midi } from '@tonejs/midi';
import { Scene } from './scene/Scene';
import { ThemeControls } from './scene/ThemeControls';
import { PlaybackControls } from './PlaybackControls';
import { StatsGrid } from './StatsGrid';
import { BackendStatus } from './BackendStatus';
import { audioEngine, type NoteEvent } from '../services/audioEngine';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { InstrumentType } from '../utils/noteColors';

interface Visualizer3DProps {
  midi: Midi;
  instrument: InstrumentType;
  fileName: string | null;
  isRealTranscription: boolean;
}

export function Visualizer3D({ midi, instrument, fileName, isRealTranscription }: Visualizer3DProps) {
  const player = useAudioPlayer();
  // Slider value kept in legacy "px/sec" range (80..600) for PlaybackControls
  // compatibility; converted to scene-space units/sec before reaching FallingBars.
  const [scrollSpeed, setScrollSpeed] = useState(220);
  const sceneScrollSpeed = scrollSpeed / 50;

  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Mount the Canvas only once the section is within 400px of the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setHasEntered(true); observer.disconnect(); } },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pause/resume the render loop as the canvas enters and leaves the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const notes = useMemo<NoteEvent[]>(() => {
    const out: NoteEvent[] = [];
    for (const tr of midi.tracks) {
      for (const n of tr.notes) {
        out.push({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }, [midi]);

  const notesRef = useRef<readonly NoteEvent[]>(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const activeNotesRef = useRef<Set<number>>(new Set());
  useEffect(() => audioEngine.onActiveNotes((set) => { activeNotesRef.current = set; }), []);

  return (
    <section className="w-full flex flex-col gap-6 px-4 md:px-10">
      <ThemeControls />
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">
            {instrument === 'piano' ? 'Piano Transcription' : 'Guitar → MIDI'}
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-extrabold text-text">Note Joscaz</h2>
          {fileName && (
            <div className="mt-1 text-sm text-muted font-mono truncate max-w-[60vw]">
              {fileName}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <BackendStatus isRealResult={isRealTranscription} />
          <div className="text-right font-mono text-xs text-muted space-y-0.5">
            <div>Notes: <span className="text-text">{notes.length}</span></div>
            <div>Tracks: <span className="text-text">{midi.tracks.length}</span></div>
            <div>BPM: <span className="text-text">{Math.round(player.bpm)}</span></div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div ref={containerRef} style={{ height: '70vh', minHeight: 600 }}>
          {hasEntered ? (
            <Scene
              instrument={instrument}
              notes={notes}
              scrollSpeed={sceneScrollSpeed}
              frameloop={isVisible ? 'always' : 'never'}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-muted font-mono text-sm animate-pulse">Loading scene…</span>
            </div>
          )}
        </div>
      </div>

      <PlaybackControls
        player={player}
        scrollSpeed={scrollSpeed}
        onScrollSpeedChange={setScrollSpeed}
        midi={midi}
        instrument={instrument}
      />

      <StatsGrid notes={notes} midi={midi} />
    </section>
  );
}
