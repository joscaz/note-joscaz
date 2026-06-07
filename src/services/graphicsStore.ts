import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GraphicsSettings, QualityPreset } from '../types/graphics';
import { DEFAULT_QUALITY, GRAPHICS_PRESETS } from '../themes/graphicsPresets';

interface GraphicsState extends GraphicsSettings {
  setPreset: (quality: QualityPreset) => void;
  updateGraphics: (patch: Partial<GraphicsSettings>) => void;
  bumpRepaint: () => void;
}

const defaults: GraphicsSettings = {
  version: 1,
  quality: DEFAULT_QUALITY,
  ...GRAPHICS_PRESETS[DEFAULT_QUALITY],
  repaintBump: 0,
};

/**
 * Single source of truth for "how hard the scene renders" — separate from
 * themeStore (which owns "how it looks"). Persisted to localStorage so a
 * user's chosen quality survives reloads; `repaintBump` is excluded from
 * persistence (it's a transient one-shot signal, not a setting).
 *
 * `bumpRepaint` exists so Canvas-agnostic code (useAudioPlayer's seek/pause)
 * can request exactly one demand-mode repaint without importing r3f. The
 * in-Canvas FrameDriver subscribes to this store and fires `invalidate()`
 * whenever `repaintBump` changes.
 */
export const useGraphicsStore = create<GraphicsState>()(
  persist(
    (set) => ({
      ...defaults,
      setPreset: (quality) => set({ quality, ...GRAPHICS_PRESETS[quality] }),
      updateGraphics: (patch) => set((s) => ({ ...s, ...patch })),
      bumpRepaint: () => set((s) => ({ repaintBump: s.repaintBump + 1 })),
    }),
    {
      name: 'note-joscaz-graphics',
      version: 1,
      partialize: (s) => ({
        version: s.version,
        quality: s.quality,
        fpsCap: s.fpsCap,
        enablePostFX: s.enablePostFX,
        enableParticles: s.enableParticles,
        particlePoolSize: s.particlePoolSize,
        dpr: s.dpr,
      }),
    },
  ),
);
