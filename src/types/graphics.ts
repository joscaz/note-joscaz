/**
 * Graphics quality settings — independent of Theme. Theme describes "how the
 * scene looks" (colors, geometry, post-FX tuning); GraphicsSettings describes
 * "how hard the GPU/CPU works to render it" (resolution, frame budget, which
 * expensive systems run at all). Same JSON shape persists to localStorage.
 */

export type QualityPreset = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  version: 1;

  quality: QualityPreset;

  fpsCap: number;             // 30 | 60 | 0 (0 = uncapped, driver runs every rAF)
  enablePostFX: boolean;
  enableParticles: boolean;
  particlePoolSize: number;
  dpr: number;                // SCALAR device-pixel-ratio fed straight to <Canvas dpr>

  repaintBump: number;        // one-shot demand-mode repaint signal (see graphicsStore)
}
