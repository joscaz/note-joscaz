import { motion } from 'framer-motion';
import type { InstrumentType } from '../utils/noteColors';

interface InstrumentSelectorProps {
  value: InstrumentType;
  onChange: (v: InstrumentType) => void;
}

export function InstrumentSelector({ value, onChange }: InstrumentSelectorProps) {
  const options: Array<{ id: InstrumentType; label: string; icon: string }> = [
    { id: 'piano', label: 'Piano', icon: '♪' },
    { id: 'guitar', label: 'Guitar', icon: '♫' },
  ];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative inline-flex items-center p-1 rounded-full bg-zinc-950 border border-white/15">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`relative z-10 px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                active ? 'text-black' : 'text-muted hover:text-text'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="instrument-pill"
                  className="absolute inset-0 rounded-full bg-[#00b4d8]"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span className="font-mono opacity-70">{o.icon}</span>
                <span>{o.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {value === 'guitar' && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-muted font-mono flex items-center gap-2"
        >
          <span className="text-guitar">→</span>
          <span>Outputs standard MIDI (playable on any piano roll)</span>
        </motion.div>
      )}
    </div>
  );
}
