import { motion } from 'framer-motion';

interface TrainingHeroProps {
  active: 'piano' | 'guitar';
  onSelect: (v: 'piano' | 'guitar') => void;
}

export function TrainingHero({ active, onSelect }: TrainingHeroProps) {
  return (
    <header className="relative overflow-hidden border-b border-white/5 bg-aurora">
      <div className="max-w-5xl mx-auto px-6 md:px-10 pt-24 md:pt-32 pb-16 md:pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex flex-col items-center gap-6"
        >
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted">
            How it was built
          </div>
          <h1 className="font-display font-extrabold leading-[0.95] text-4xl md:text-6xl lg:text-7xl max-w-4xl">
            <span className="text-text">Teaching a neural net to </span>
            <span className="text-shimmer">hear notes</span>
          </h1>
          <p className="text-base md:text-lg text-muted max-w-2xl leading-relaxed">
            The two models behind this site. Piano came from the{' '}
            <em className="text-text not-italic">Onsets &amp; Velocities</em>{' '}
            paper. Guitar is that same architecture, fine-tuned on GuitarSet.
            Here's how each one was cooked.
          </p>

          <div className="relative inline-flex items-center p-1 rounded-full bg-zinc-950 border border-white/15 mt-4">
            {(['piano', 'guitar'] as const).map((id) => {
              const a = active === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className={`relative z-10 px-5 md:px-7 py-2 rounded-full text-sm font-semibold transition-colors ${
                    a ? 'text-black' : 'text-muted hover:text-text'
                  }`}
                >
                  {a && (
                    <motion.div
                      layoutId="training-pill"
                      className={`absolute inset-0 rounded-full ${
                        id === 'piano' ? 'bg-piano' : 'bg-guitar'
                      }`}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <span className="font-mono opacity-70">
                      {id === 'piano' ? '♪' : '♫'}
                    </span>
                    <span className="capitalize">{id}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </header>
  );
}
