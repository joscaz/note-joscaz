import { create } from 'zustand';
import type { PresetName, Theme } from '../types/theme';
import { DEFAULT_PRESET, PRESETS } from '../themes/presets';

interface ThemeState {
  theme: Theme;
  presetName: PresetName;
  setPreset: (name: PresetName) => void;
  updateTheme: (patch: DeepPartial<Theme>) => void;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(patch)) {
    const pv = patch[k as keyof T];
    const bv = (base as Record<string, unknown>)[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object') {
      out[k] = deepMerge(bv as object, pv as DeepPartial<typeof bv>);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out as T;
}

/**
 * Single source of truth for the visualizer theme. Scene components subscribe
 * with selectors so unrelated param changes don't re-render everything.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: PRESETS[DEFAULT_PRESET],
  presetName: DEFAULT_PRESET,
  setPreset: (name) => set({ presetName: name, theme: PRESETS[name] }),
  updateTheme: (patch) => set((s) => ({ theme: deepMerge(s.theme, patch) })),
}));
