import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { navigate } from '../hooks/useHashRoute';
import { Footer } from './Footer';
import { TrainingHero } from './training/TrainingHero';
import { PianoTraining } from './training/PianoTraining';
import { GuitarTraining } from './training/GuitarTraining';

type Tab = 'piano' | 'guitar';

/**
 * Long-form "How it was built" page. Two sections — piano and guitar — behind
 * a pill switcher. The switcher state is mirrored into `location.hash` so
 * deep-linking works (`#/training/guitar`).
 */
export function TrainingPage() {
  const [active, setActive] = useState<Tab>(() => readTabFromHash());

  useEffect(() => {
    const onHash = () => setActive(readTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (t: Tab) => {
    navigate(`/training/${t}`);
    setActive(t);
  };

  return (
    <main className="relative min-h-screen bg-bg">
      <TopBar />
      <TrainingHero active={active} onSelect={select} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {active === 'piano' ? <PianoTraining /> : <GuitarTraining />}
        </motion.div>
      </AnimatePresence>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-14 md:py-20">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 md:px-10 py-10 md:py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted mb-2">
              Ready?
            </div>
            <div className="font-display font-extrabold text-2xl md:text-3xl leading-tight">
              Try it on your own audio →
            </div>
            <div className="text-sm text-muted mt-1 max-w-xl">
              The full transcription pipeline runs in your browser. No uploads
              to a server, no waiting in a queue.
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-full font-button font-bold text-base text-black bg-[#00b4d8] hover:scale-[1.04] active:scale-[0.98] transition-transform"
          >
            Back to demo
          </button>
        </div>
      </div>

      <Footer />
    </main>
  );
}

function TopBar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-bg/70 border-b border-white/5">
      <div className="max-w-5xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 group"
        >
          <span className="font-display font-extrabold text-base tracking-tight group-hover:text-shimmer">
            NoteJoscaz AI
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-muted">
            / training
          </span>
        </button>
        <div className="flex items-center gap-5 text-xs font-mono uppercase tracking-wider text-muted">
          <button onClick={() => navigate('/')} className="hover:text-text">
            Demo
          </button>
          <a
            href="https://arxiv.org/abs/2303.04485"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text"
          >
            Paper
          </a>
          <a
            href="https://github.com/andres-fr/iamusica_training"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text"
          >
            Repo
          </a>
        </div>
      </div>
    </nav>
  );
}

function readTabFromHash(): Tab {
  const h = window.location.hash;
  if (h.includes('/guitar')) return 'guitar';
  return 'piano';
}
