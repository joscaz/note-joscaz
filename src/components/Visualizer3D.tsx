import { useEffect, useMemo, useRef, useState } from 'react';
import type { Midi } from '@tonejs/midi';
import { Scene } from './scene/Scene';
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
        <div style={{ height: '70vh', minHeight: 600 }}>
          <Scene instrument={instrument} notes={notes} scrollSpeed={sceneScrollSpeed} />
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
