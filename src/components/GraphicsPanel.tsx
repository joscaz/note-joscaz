import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useGraphicsStore } from '../services/graphicsStore';
import { Section, ToggleRow, RangeRow, RangeWithNumberRow } from './ThemePanel';
import type { QualityPreset } from '../types/graphics';

// ---------------------------------------------------------------------------
// Collapse animation variants — mirrors ThemePanel's sectionVariants exactly
// so both panels feel like the same visual language.
// ---------------------------------------------------------------------------
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

const PRESET_ORDER: readonly QualityPreset[] = ['low', 'medium', 'high'];
const PRESET_LABELS: Record<QualityPreset, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const FPS_CAP_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 0, label: 'Uncapped' },
];

const ACCENT = '#7dd3fc';

// ---------------------------------------------------------------------------
// PresetSegmented — 3-button segmented control (Low / Medium / High)
// ---------------------------------------------------------------------------
function PresetSegmented() {
  const quality = useGraphicsStore((s) => s.quality);
  const setPreset = useGraphicsStore((s) => s.setPreset);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">quality preset</span>
      <div className="flex flex-1 rounded-lg border border-white/10 overflow-hidden">
        {PRESET_ORDER.map((preset) => {
          const active = quality === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setPreset(preset)}
              aria-pressed={active}
              className={`flex-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                active
                  ? 'bg-white/10 text-text'
                  : 'text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FpsCapRow — 3-step control (30 / 60 / Uncapped) mapping Uncapped to fpsCap=0
// ---------------------------------------------------------------------------
function FpsCapRow() {
  const fpsCap = useGraphicsStore((s) => s.fpsCap);
  const updateGraphics = useGraphicsStore((s) => s.updateGraphics);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">fps cap</span>
      <div className="flex flex-1 rounded-lg border border-white/10 overflow-hidden">
        {FPS_CAP_OPTIONS.map(({ value, label }) => {
          const active = fpsCap === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => updateGraphics({ fpsCap: value })}
              aria-pressed={active}
              className={`flex-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                active
                  ? 'bg-white/10 text-text'
                  : 'text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphicsPanel — default export, mounted as a sibling right after ThemePanel
// ---------------------------------------------------------------------------
export default function GraphicsPanel() {
  const isMobile = useMediaQuery('(max-width: 639px)');
  if (isMobile) return null;

  return <GraphicsPanelInner />;
}

// Inner component so hooks are always called — GraphicsPanel gates on isMobile,
// GraphicsPanelInner holds all store subscriptions (mirrors ThemePanelInner).
function GraphicsPanelInner() {
  const [panelOpen, setPanelOpen] = useState(false);

  const enablePostFX = useGraphicsStore((s) => s.enablePostFX);
  const enableParticles = useGraphicsStore((s) => s.enableParticles);
  const dpr = useGraphicsStore((s) => s.dpr);
  const particlePoolSize = useGraphicsStore((s) => s.particlePoolSize);
  const updateGraphics = useGraphicsStore((s) => s.updateGraphics);

  return (
    <div className="glass rounded-2xl border border-white/10 p-4 md:p-5 flex flex-col gap-2">
      {/* Header */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
        className="flex items-center justify-between w-full pb-1 border-b border-white/5 cursor-pointer hover:text-text transition-colors"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-muted">Graphics quality</span>
        <span
          aria-hidden
          className="text-base leading-none text-muted transition-transform duration-200"
          style={{ transform: panelOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      <motion.div
        initial={false}
        animate={panelOpen ? 'open' : 'closed'}
        variants={sectionVariants}
        style={{ overflow: 'hidden' }}
      >
        <div className="flex flex-col gap-2 pt-2">
          <PresetSegmented />

          <Section label="Fine-tune">
            <ToggleRow
              label="post-fx"
              value={enablePostFX}
              onChange={(v) => updateGraphics({ enablePostFX: v })}
            />
            <ToggleRow
              label="particles"
              value={enableParticles}
              onChange={(v) => updateGraphics({ enableParticles: v })}
            />
            <FpsCapRow />
            <RangeRow
              label="dpr"
              value={dpr}
              onChange={(v) => updateGraphics({ dpr: v })}
              min={0.5} max={2} step={0.25}
              accentColor={ACCENT}
            />
            <RangeWithNumberRow
              label="particle pool"
              value={particlePoolSize}
              onChange={(v) => updateGraphics({ particlePoolSize: v })}
              min={256} max={2048} step={256}
              accentColor={ACCENT}
            />
          </Section>
        </div>
      </motion.div>
    </div>
  );
}
