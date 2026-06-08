import type { GraphicsSettings, QualityPreset } from '../types/graphics';

/**
 * Authoritative knob table for the three quality presets. Selecting a preset
 * atomically overwrites every knob below (see graphicsStore.setPreset) — this
 * is the single source of truth for "what Low/Medium/High mean".
 *
 * `dpr` for `high` reads `window.devicePixelRatio` — guarded for SSR/export
 * environments where `window` is undefined (per design risk note: the same
 * JSON must stay serializable for the headless export path).
 */
const highDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export const GRAPHICS_PRESETS: Record<QualityPreset, Omit<GraphicsSettings, 'version' | 'quality' | 'repaintBump'>> = {
  low: {
    fpsCap: 30,
    dpr: 1.0,
    enablePostFX: false,
    enableParticles: false,
    particlePoolSize: 256,
  },
  medium: {
    fpsCap: 60,
    dpr: 1.5,
    enablePostFX: true,
    enableParticles: true,
    particlePoolSize: 1024,
  },
  high: {
    fpsCap: 0,
    dpr: highDpr,
    enablePostFX: true,
    enableParticles: true,
    particlePoolSize: 2048,
  },
};

export const DEFAULT_QUALITY: QualityPreset = 'medium';
