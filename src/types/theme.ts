/**
 * Cinematic visualizer theme. Fully describes every tunable parameter of the
 * 3D scene — camera, piano, bars, particles, post-FX. Same JSON drives the
 * browser live render AND the (future) headless mp4 export path, so every
 * preset must be serializable (no functions, no refs).
 */

export interface Theme {
  version: 1;

  background: string;
  fog: { color: string; near: number; far: number };

  camera: {
    tiltDeg: number;        // downward tilt from horizontal
    distance: number;       // orbit radius from target
    offsetYFrac: number;    // vertical framing shift (0..1 of view height)
  };

  piano: {
    whiteBase: string;
    blackBase: string;
    pressGlow: string;            // emissive color when a key is active
    pressEmissiveIntensity: number;
    pressDepth: number;            // scene-units pressed keys travel down
  };

  bars: {
    colorTop: string;     // high-velocity end of gradient
    colorBottom: string;  // low-velocity end of gradient
    emissiveColor: string;
    emissiveIntensity: number;
    roughness: number;
    metalness: number;
  };

  particles: {
    enabled: boolean;
    color: string;
    burstCount: number;
    poolSize: number;
    gravityY: number;       // negative = downward accel
    lifeMin: number;
    lifeMax: number;
    initialVelY: number;    // upward velocity seed
    spread: number;         // lateral jitter radius
    size: number;           // point-sprite world size
  };

  postfx: {
    bloomIntensity: number;
    bloomThreshold: number;
    bloomRadius: number;
    chromaticOffset: number;
    vignetteDarkness: number;
  };
}

export type PresetName = 'default' | 'neon' | 'fire' | 'water' | 'crystal';
