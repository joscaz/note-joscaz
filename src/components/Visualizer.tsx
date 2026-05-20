import { useEffect, useMemo, useRef, useState } from 'react';
import type { Midi } from '@tonejs/midi';
import { PianoRoll } from './PianoRoll';
import { PianoKeyboard } from './PianoKeyboard';
import { PlaybackControls } from './PlaybackControls';
import { StatsGrid } from './StatsGrid';
import { BackendStatus } from './BackendStatus';
import { audioEngine, type NoteEvent } from '../services/audioEngine';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { InstrumentType } from '../utils/noteColors';

interface VisualizerProps {
  midi: Midi;
  instrument: InstrumentType;
  fileName: string | null;
  isRealTranscription: boolean;
  isCurated?: boolean;
  curatedAttribution?: string | null;
  isDownloadable?: boolean;
}

export function Visualizer({
  midi,
  instrument,
  fileName,
  isRealTranscription,
  isCurated,
  curatedAttribution,
  isDownloadable = true,
}: VisualizerProps) {
  const player = useAudioPlayer();
  const [scrollSpeed, setScrollSpeed] = useState(220);

  // Flatten notes once per midi/instrument change.
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

  // Subscribe to the engine's active-notes stream.
  useEffect(() => {
    return audioEngine.onActiveNotes((set) => {
      activeNotesRef.current = set;
    });
  }, []);

  return (
    <section className="w-full flex flex-col gap-6 px-4 md:px-10">
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

      <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="relative" style={{ height: '60vh', minHeight: 540 }}>
          <div className="absolute inset-x-0 top-0" style={{ height: '75%' }}>
            <PianoRoll
              notesRef={notesRef}
              activeNotesRef={activeNotesRef}
              instrument={instrument}
              scrollSpeed={scrollSpeed}
              bpm={player.bpm}
            />
          </div>
          <div className="absolute inset-x-0 bottom-0" style={{ height: '25%' }}>
            <PianoKeyboard
              instrument={instrument}
              activeNotesRef={activeNotesRef}
              height={Math.floor(window.innerHeight * 0.6 * 0.25)}
            />
          </div>
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
