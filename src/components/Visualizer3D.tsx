import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
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
  isCurated?: boolean;
  curatedAttribution?: string | null;
  isDownloadable?: boolean;
}

export function Visualizer3D({
  midi,
  instrument,
  fileName,
  isRealTranscription,
  isCurated,
  curatedAttribution,
  isDownloadable = true,
}: Visualizer3DProps) {
  const player = useAudioPlayer();
  const isMobile = useMediaQuery('(max-width: 639px)');
  const [mobileWarningDismissed, setMobileWarningDismissed] = useState(false);
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
            {isCurated ? 'Official Classical MIDI' : (instrument === 'piano' ? 'Piano Transcription' : 'Guitar → MIDI')}
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-extrabold text-text">Note Joscaz</h2>
          {fileName && (
            <div className="mt-1 text-sm text-muted font-mono truncate max-w-[60vw]">
              {fileName}
            </div>
          )}
          {isCurated && curatedAttribution && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/5 text-[11px] text-muted font-mono">
              <svg className="w-3.5 h-3.5 text-piano-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span>Arranger: <strong className="text-text font-semibold">{curatedAttribution}</strong></span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <BackendStatus isRealResult={isRealTranscription} isCurated={isCurated} />
          <div className="text-right font-mono text-xs text-muted space-y-0.5">
            <div>Notes: <span className="text-text">{notes.length}</span></div>
            <div>Tracks: <span className="text-text">{midi.tracks.length}</span></div>
            <div>BPM: <span className="text-text">{Math.round(player.bpm)}</span></div>
          </div>
        </div>
      </div>

      {isMobile && !mobileWarningDismissed && (
        <div className="flex items-center justify-between bg-yellow-900/80 text-yellow-200 text-sm px-4 py-2 rounded-xl">
          <span>3D mode may be slow on mobile devices</span>
          <button
            onClick={() => setMobileWarningDismissed(true)}
            className="ml-4 text-yellow-200/60 hover:text-yellow-200 transition-colors"
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div ref={containerRef} style={{ height: '70vh', minHeight: isMobile ? 320 : 600 }}>
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
        isDownloadable={isDownloadable}
      />

      <StatsGrid notes={notes} midi={midi} />
    </section>
  );
}
