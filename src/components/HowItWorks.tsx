import { motion } from 'framer-motion';
import { navigate } from '../hooks/useHashRoute';

interface Step {
  num: string;
  title: string;
  blurb: string;
  accent: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    num: '01',
    title: 'Transcribe audio',
    blurb:
      'Drop an MP3 or WAV and pick Piano or Guitar. The model returns frame-accurate MIDI you can watch play back over your original recording.',
    accent: '#00b4d8',
    icon: (
      <path
        d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v4M8 22h8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    num: '02',
    title: 'Bring your own MIDI',
    blurb:
      'Already have a .mid or .midi? Drop it in and visualize it instantly — parsed right in your browser, no server round-trip.',
    accent: '#00f5a0',
    icon: (
      <>
        <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  {
    num: '03',
    title: 'Curated library',
    blurb:
      'Play high-fidelity, hand-crafted MIDI arrangements from the built-in collection, organized by genre and difficulty.',
    accent: '#ff5d8f',
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 md:px-10 py-20 md:py-28 bg-bg">
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="text-center space-y-3">
          <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">How it works</div>
          <h2 className="font-display text-4xl md:text-6xl font-extrabold text-text">
            Three ways to MIDI
          </h2>
          <p className="text-muted max-w-xl mx-auto">
            However your music starts, it converges on the same frame-perfect, falling-note visualizer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, delay: i * 0.1, ease: 'easeOut' }}
              className="glass rounded-2xl border border-white/10 p-6 flex flex-col gap-4 transition-all hover:border-white/20 hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${step.accent}20, ${step.accent}05)`,
                    border: `1px solid ${step.accent}55`,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={step.accent} strokeWidth="2">
                    {step.icon}
                  </svg>
                </div>
                <span className="font-mono text-xs text-muted/60 tracking-widest">{step.num}</span>
              </div>
              <h3 className="font-display font-bold text-xl text-text">{step.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{step.blurb}</p>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/player')}
            className="relative px-8 py-4 rounded-full font-button font-bold text-base text-black transition-transform hover:scale-[1.04] active:scale-[0.98] bg-[#00b4d8]"
          >
            Open Player →
          </button>
        </div>
      </div>
    </section>
  );
}
