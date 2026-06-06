import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Midi } from '@tonejs/midi';
import type { NoteEvent } from '../services/audioEngine';
import { midiToNoteName } from '../utils/musicTheory';
import { NOTE_GRADIENTS, type InstrumentType } from '../utils/noteColors';

// Collapse animation variants (height: 0 <-> auto) — matches ThemePanel.
const sectionVariants = {
  open: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
  },
} as const;

interface StatsGridProps {
  notes: readonly NoteEvent[];
  midi: Midi;
  instrument: InstrumentType;
}

export function StatsGrid({ notes, midi, instrument }: StatsGridProps) {
  const stats = useMemo(() => {
    if (notes.length === 0) {
      return {
        total: 0, avgVel: 0, duration: 0, polyphony: 0, low: 0, high: 0,
      };
    }
    let total = 0;
    let velSum = 0;
    let low = 200;
    let high = 0;
    let maxEnd = 0;
    // Sweep-line polyphony: sort by time, track active count at each event.
    const events: Array<{ t: number; d: number }> = [];
    for (const n of notes) {
      total++;
      velSum += n.velocity;
      if (n.midi < low) low = n.midi;
      if (n.midi > high) high = n.midi;
      const end = n.time + n.duration;
      if (end > maxEnd) maxEnd = end;
      events.push({ t: n.time, d: 1 });
      events.push({ t: end, d: -1 });
    }
    events.sort((a, b) => a.t - b.t || a.d - b.d);
    let active = 0;
    let polyphony = 0;
    for (const ev of events) {
      active += ev.d;
      if (active > polyphony) polyphony = active;
    }
    return {
      total,
      avgVel: velSum / total,
      duration: maxEnd,
      polyphony,
      low,
      high,
    };
  }, [notes]);

  const tempo = midi.header.tempos[0]?.bpm ?? 120;

  const items: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Notes Detected', value: stats.total.toString(), accent: true },
    { label: 'Avg Velocity', value: `${Math.round(stats.avgVel * 127)} / 127` },
    { label: 'Tempo', value: `${Math.round(tempo)} BPM` },
    { label: 'Duration', value: formatDuration(stats.duration) },
    { label: 'Max Polyphony', value: stats.polyphony.toString() },
    {
      label: 'Note Range',
      value: `${midiToNoteName(stats.low)} → ${midiToNoteName(stats.high)}`,
    },
  ];

  const accentColor = NOTE_GRADIENTS[instrument].top;

  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between w-full py-2 cursor-pointer hover:text-text transition-colors select-none"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-muted">Additional data</span>
        <span
          aria-hidden
          className="text-base leading-none text-muted transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      <motion.div
        initial={false}
        animate={open ? 'open' : 'closed'}
        variants={sectionVariants}
        style={{ overflow: 'hidden' }}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 pt-1">
          {items.map((it) => (
            <StatCard key={it.label} {...it} accentColor={accentColor} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ label, value, accent, accentColor }: { label: string; value: string; accent?: boolean; accentColor: string }) {
  return (
    <div
      className="glass rounded-xl border border-white/10 p-4 transition-all hover:border-white/20 hover:-translate-y-0.5"
    >
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted font-mono">{label}</div>
      <AnimatedValue value={value} accent={!!accent} accentColor={accentColor} />
    </div>
  );
}

function AnimatedValue({ value, accent, accentColor }: { value: string; accent: boolean; accentColor: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const numeric = parseFloat(value);
  const animatable = isFinite(numeric) && !/[a-zA-Z→:]/.test(value);
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    if (!animatable) return;
    const target = numeric;
    const start = 0;
    const dur = 700;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + (target - start) * eased;
      const formatted = value.replace(/^[\d.]+/, v.toFixed(target > 10 ? 0 : 1));
      setDisplayed(formatted);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, numeric, animatable]);

  // For non-numeric values, just show as-is (no state update inside effect).
  const shown = animatable ? displayed : value;

  return (
    <div
      ref={ref}
      className={`mt-2 font-display font-extrabold text-2xl md:text-3xl ${accent ? '' : 'text-text'}`}
      style={accent ? { color: accentColor } : undefined}
    >
      {shown}
    </div>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
