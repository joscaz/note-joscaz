import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useThemeStore } from '../services/themeStore';
import { PRESETS } from '../themes/presets';
import type { PresetName } from '../types/theme';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';

// ---------------------------------------------------------------------------
// Collapse animation variants (height: 0 <-> auto)
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

// ---------------------------------------------------------------------------
// Section sub-component — <details> with framer-motion animated body
// ---------------------------------------------------------------------------
interface SectionProps {
  label: string;
  children: ReactNode;
}

function Section({ label, children }: SectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="cursor-pointer w-full flex items-center justify-between py-2 font-mono uppercase tracking-wider text-xs text-muted hover:text-text transition-colors select-none"
      >
        {label}
        <span
          aria-hidden
          className="text-muted transition-transform duration-200"
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
        <div className="pt-2 pb-1 flex flex-col gap-2">{children}</div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-components
// ---------------------------------------------------------------------------
interface RangeRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  accentColor: string;
}

function RangeRow({ label, value, onChange, min, max, step, accentColor }: RangeRowProps) {
  // Format value for display — show up to 4 decimal places for small steps
  const displayValue = step < 0.01 ? value.toFixed(4) : step < 0.1 ? value.toFixed(3) : step < 1 ? value.toFixed(2) : String(value);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[color:var(--accent)]"
        style={{ ['--accent' as string]: accentColor } as CSSProperties}
      />
      <span className="tabular-nums w-12 text-xs font-mono text-text text-right">{displayValue}</span>
    </div>
  );
}

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">{label}</span>
      <div className="w-7 h-7 rounded border border-white/10 overflow-hidden p-0 shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full cursor-pointer border-0 bg-transparent"
          aria-label={label}
        />
      </div>
      <span className="tabular-nums text-xs font-mono text-muted">{value}</span>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border transition-colors ${
          value
            ? 'bg-white/10 border-white/30 text-text'
            : 'border-white/10 text-muted hover:text-text hover:border-white/20'
        }`}
      >
        {value ? 'on' : 'off'}
      </button>
    </div>
  );
}

interface RangeWithNumberRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  accentColor: string;
}

function RangeWithNumberRow({ label, value, onChange, min, max, step, accentColor }: RangeWithNumberRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted w-32 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[color:var(--accent)]"
        style={{ ['--accent' as string]: accentColor } as CSSProperties}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-text tabular-nums"
        aria-label={label}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PresetSelect — named export, used in Visualizer3D header
// ---------------------------------------------------------------------------
export function PresetSelect() {
  const presetName = useThemeStore((s) => s.presetName);
  const setPreset = useThemeStore((s) => s.setPreset);

  return (
    <select
      value={presetName}
      onChange={(e) => setPreset(e.target.value as PresetName)}
      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-text hover:border-white/30 transition-colors"
    >
      {(Object.keys(PRESETS) as PresetName[]).map((p) => (
        <option key={p} value={p} className="bg-bg text-text">
          {p}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// ThemePanel — default export, mounted below PlaybackControls
// ---------------------------------------------------------------------------
interface ThemePanelProps {
  instrument: InstrumentType;
}

export default function ThemePanel({ instrument }: ThemePanelProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');
  if (isMobile) return null;

  const grad = NOTE_GRADIENTS[instrument];
  const accent = grad.top;

  return <ThemePanelInner accent={accent} />;
}

// Inner component so hooks are always called — ThemePanel gates on isMobile,
// ThemePanelInner holds all store subscriptions.
function ThemePanelInner({ accent }: { accent: string }) {
  const [panelOpen, setPanelOpen] = useState(false);

  // Scene
  const background = useThemeStore((s) => s.theme.background);
  const fogNear = useThemeStore((s) => s.theme.fog.near);
  const fogFar = useThemeStore((s) => s.theme.fog.far);

  // Camera
  const tiltDeg = useThemeStore((s) => s.theme.camera.tiltDeg);
  const distance = useThemeStore((s) => s.theme.camera.distance);
  const offsetYFrac = useThemeStore((s) => s.theme.camera.offsetYFrac);

  // Piano
  const whiteBase = useThemeStore((s) => s.theme.piano.whiteBase);
  const blackBase = useThemeStore((s) => s.theme.piano.blackBase);
  const pressGlow = useThemeStore((s) => s.theme.piano.pressGlow);
  const pressEmissiveIntensity = useThemeStore((s) => s.theme.piano.pressEmissiveIntensity);
  const pressDepth = useThemeStore((s) => s.theme.piano.pressDepth);

  // Bars
  const barsColorTop = useThemeStore((s) => s.theme.bars.colorTop);
  const barsColorBottom = useThemeStore((s) => s.theme.bars.colorBottom);
  const barsEmissiveColor = useThemeStore((s) => s.theme.bars.emissiveColor);
  const barsEmissiveIntensity = useThemeStore((s) => s.theme.bars.emissiveIntensity);
  const barsRoughness = useThemeStore((s) => s.theme.bars.roughness);
  const barsMetalness = useThemeStore((s) => s.theme.bars.metalness);

  // Particles
  const particlesEnabled = useThemeStore((s) => s.theme.particles.enabled);
  const particlesColor = useThemeStore((s) => s.theme.particles.color);
  const burstCount = useThemeStore((s) => s.theme.particles.burstCount);
  const gravityY = useThemeStore((s) => s.theme.particles.gravityY);
  const lifeMax = useThemeStore((s) => s.theme.particles.lifeMax);
  const initialVelY = useThemeStore((s) => s.theme.particles.initialVelY);
  const spread = useThemeStore((s) => s.theme.particles.spread);
  const size = useThemeStore((s) => s.theme.particles.size);

  // PostFX
  const bloomIntensity = useThemeStore((s) => s.theme.postfx.bloomIntensity);
  const bloomThreshold = useThemeStore((s) => s.theme.postfx.bloomThreshold);
  const bloomRadius = useThemeStore((s) => s.theme.postfx.bloomRadius);
  const chromaticOffset = useThemeStore((s) => s.theme.postfx.chromaticOffset);
  const vignetteDarkness = useThemeStore((s) => s.theme.postfx.vignetteDarkness);

  const updateTheme = useThemeStore((s) => s.updateTheme);

  return (
    <div className="glass rounded-2xl border border-white/10 p-4 md:p-5 flex flex-col gap-2">
      {/* Header */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
        className="flex items-center justify-between w-full pb-1 border-b border-white/5 cursor-pointer hover:text-text transition-colors"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-muted">Theme tuning</span>
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

      {/* Scene */}
      <Section label="Scene">
        <ColorRow
          label="background"
          value={background}
          onChange={(v) => updateTheme({ background: v })}
        />
        <RangeRow
          label="fog near"
          value={fogNear}
          onChange={(v) => updateTheme({ fog: { near: v } })}
          min={2} max={80} step={1}
          accentColor={accent}
        />
        <RangeRow
          label="fog far"
          value={fogFar}
          onChange={(v) => updateTheme({ fog: { far: v } })}
          min={10} max={200} step={1}
          accentColor={accent}
        />
      </Section>

      {/* Camera */}
      <Section label="Camera">
        <RangeRow
          label="tilt deg"
          value={tiltDeg}
          onChange={(v) => updateTheme({ camera: { tiltDeg: v } })}
          min={0} max={85} step={1}
          accentColor={accent}
        />
        <RangeRow
          label="distance"
          value={distance}
          onChange={(v) => updateTheme({ camera: { distance: v } })}
          min={4} max={24} step={0.1}
          accentColor={accent}
        />
        <RangeRow
          label="offset y frac"
          value={offsetYFrac}
          onChange={(v) => updateTheme({ camera: { offsetYFrac: v } })}
          min={-0.5} max={0.8} step={0.01}
          accentColor={accent}
        />
      </Section>

      {/* Piano */}
      <Section label="Piano">
        <ColorRow
          label="white base"
          value={whiteBase}
          onChange={(v) => updateTheme({ piano: { whiteBase: v } })}
        />
        <ColorRow
          label="black base"
          value={blackBase}
          onChange={(v) => updateTheme({ piano: { blackBase: v } })}
        />
        <ColorRow
          label="press glow"
          value={pressGlow}
          onChange={(v) => updateTheme({ piano: { pressGlow: v } })}
        />
        <RangeRow
          label="press emissive"
          value={pressEmissiveIntensity}
          onChange={(v) => updateTheme({ piano: { pressEmissiveIntensity: v } })}
          min={0} max={4} step={0.05}
          accentColor={accent}
        />
        <RangeRow
          label="press depth"
          value={pressDepth}
          onChange={(v) => updateTheme({ piano: { pressDepth: v } })}
          min={0} max={0.2} step={0.005}
          accentColor={accent}
        />
      </Section>

      {/* Bars */}
      <Section label="Bars">
        <ColorRow
          label="color top"
          value={barsColorTop}
          onChange={(v) => updateTheme({ bars: { colorTop: v } })}
        />
        <ColorRow
          label="color bottom"
          value={barsColorBottom}
          onChange={(v) => updateTheme({ bars: { colorBottom: v } })}
        />
        <ColorRow
          label="emissive color"
          value={barsEmissiveColor}
          onChange={(v) => updateTheme({ bars: { emissiveColor: v } })}
        />
        <RangeRow
          label="emissive"
          value={barsEmissiveIntensity}
          onChange={(v) => updateTheme({ bars: { emissiveIntensity: v } })}
          min={0} max={3} step={0.05}
          accentColor={accent}
        />
        <RangeRow
          label="roughness"
          value={barsRoughness}
          onChange={(v) => updateTheme({ bars: { roughness: v } })}
          min={0} max={1} step={0.02}
          accentColor={accent}
        />
        <RangeRow
          label="metalness"
          value={barsMetalness}
          onChange={(v) => updateTheme({ bars: { metalness: v } })}
          min={0} max={1} step={0.02}
          accentColor={accent}
        />
      </Section>

      {/* Particles */}
      <Section label="Particles">
        <ToggleRow
          label="enabled"
          value={particlesEnabled}
          onChange={(v) => updateTheme({ particles: { enabled: v } })}
        />
        <ColorRow
          label="color"
          value={particlesColor}
          onChange={(v) => updateTheme({ particles: { color: v } })}
        />
        <RangeRow
          label="burst count"
          value={burstCount}
          onChange={(v) => updateTheme({ particles: { burstCount: v } })}
          min={0} max={48} step={1}
          accentColor={accent}
        />
        <RangeRow
          label="gravity y"
          value={gravityY}
          onChange={(v) => updateTheme({ particles: { gravityY: v } })}
          min={-8} max={4} step={0.1}
          accentColor={accent}
        />
        <RangeRow
          label="life max"
          value={lifeMax}
          onChange={(v) => updateTheme({ particles: { lifeMax: v } })}
          min={0.2} max={3} step={0.05}
          accentColor={accent}
        />
        <RangeRow
          label="initial vel y"
          value={initialVelY}
          onChange={(v) => updateTheme({ particles: { initialVelY: v } })}
          min={0} max={6} step={0.1}
          accentColor={accent}
        />
        <RangeRow
          label="spread"
          value={spread}
          onChange={(v) => updateTheme({ particles: { spread: v } })}
          min={0} max={1} step={0.01}
          accentColor={accent}
        />
        <RangeRow
          label="size"
          value={size}
          onChange={(v) => updateTheme({ particles: { size: v } })}
          min={4} max={64} step={1}
          accentColor={accent}
        />
      </Section>

      {/* PostFX */}
      <Section label="PostFX">
        <RangeRow
          label="bloom intensity"
          value={bloomIntensity}
          onChange={(v) => updateTheme({ postfx: { bloomIntensity: v } })}
          min={0} max={3} step={0.05}
          accentColor={accent}
        />
        <RangeRow
          label="bloom threshold"
          value={bloomThreshold}
          onChange={(v) => updateTheme({ postfx: { bloomThreshold: v } })}
          min={0} max={1} step={0.02}
          accentColor={accent}
        />
        <RangeRow
          label="bloom radius"
          value={bloomRadius}
          onChange={(v) => updateTheme({ postfx: { bloomRadius: v } })}
          min={0} max={1.5} step={0.02}
          accentColor={accent}
        />
        <RangeWithNumberRow
          label="chromatic offset"
          value={chromaticOffset}
          onChange={(v) => updateTheme({ postfx: { chromaticOffset: v } })}
          min={0} max={0.004} step={0.0001}
          accentColor={accent}
        />
        <RangeRow
          label="vignette"
          value={vignetteDarkness}
          onChange={(v) => updateTheme({ postfx: { vignetteDarkness: v } })}
          min={0} max={1.2} step={0.02}
          accentColor={accent}
        />
      </Section>

        </div>
      </motion.div>
    </div>
  );
}
