import { motion } from 'framer-motion';
import { MidiBackground } from './MidiBackground';

interface HeroProps {
  onCtaClick: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  return (
    <MidiBackground className="w-full min-h-[92vh] flex items-center justify-center">
      <motion.div
        className="relative z-10 max-w-5xl text-center px-6 flex flex-col items-center gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >

        <h1 className="font-display font-extrabold leading-[0.95] text-5xl md:text-7xl lg:text-8xl">
          <span className="glitch" data-text="Raw Audio">Raw Audio</span>
          <span className="text-muted font-light"> → </span>
          <span className="text-text">Perfect MIDI</span>
        </h1>

        <motion.p
          className="text-base md:text-xl text-muted max-w-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Onset &amp; velocity detection for Piano and fine-tuned for Guitar.
          Watch your sound become a frame-perfect, falling-note score.
        </motion.p>

        <motion.div
          className="relative flex flex-col md:flex-row items-center gap-4 md:gap-5"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <button
            onClick={onCtaClick}
            className="relative px-8 md:px-10 py-4 md:py-5 rounded-full font-button font-bold text-base md:text-lg text-black transition-transform hover:scale-[1.04] active:scale-[0.98] bg-[#00b4d8]"
          >
            Upload Audio →
          </button>
          <a
            href="#/training"
            className="group text-xs md:text-sm font-mono uppercase tracking-[0.25em] text-muted hover:text-text transition-colors flex items-center gap-2"
          >
            How it was built
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
        </motion.div>

        <div className="mt-8 grid grid-cols-3 gap-6 md:gap-10 text-center text-xs font-mono text-muted uppercase tracking-wider">
          <div>
            <div className="text-text font-display text-2xl md:text-3xl">60 fps</div>
            <div>Canvas renderer</div>
          </div>
          <div>
            <div className="text-text font-display text-2xl md:text-3xl">0 ms</div>
            <div>Audio drift</div>
          </div>
          <div>
            <div className="text-text font-display text-2xl md:text-3xl">88 keys</div>
            <div>Full range</div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-[10px] font-mono text-muted uppercase tracking-[0.4em] flex flex-col items-center gap-2"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span>Scroll</span>
        <span className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent" />
      </motion.div>
    </MidiBackground>
  );
}
