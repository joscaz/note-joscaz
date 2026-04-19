import { useEffect, useRef } from 'react';
import { startPianoRoll } from '../hooks/usePianoRoll';
import type { NoteEvent } from '../services/audioEngine';
import type { InstrumentType } from '../utils/noteColors';

interface PianoRollProps {
  notesRef: React.RefObject<readonly NoteEvent[]>;
  activeNotesRef: React.RefObject<Set<number>>;
  instrument: InstrumentType;
  scrollSpeed: number;
  bpm: number;
}

export function PianoRoll({ notesRef, activeNotesRef, instrument, scrollSpeed, bpm }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const instrumentRef = useRef<InstrumentType>(instrument);
  const scrollSpeedRef = useRef<number>(scrollSpeed);
  const bpmRef = useRef<number>(bpm);

  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    return startPianoRoll({
      canvas,
      container,
      notesRef,
      instrumentRef,
      scrollSpeedRef,
      activeNotesRef,
      bpmRef,
    });
  }, [notesRef, activeNotesRef]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
