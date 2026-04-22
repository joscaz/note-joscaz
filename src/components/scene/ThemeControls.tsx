import { useControls, folder, Leva } from 'leva';
import { useThemeStore } from '../../services/themeStore';
import type { PresetName } from '../../types/theme';
import { PRESETS } from '../../themes/presets';

/**
 * Leva-driven live tuning panel. Mounted at the Visualizer3D level (outside
 * the <Canvas>); every change flows through the themeStore, which scene
 * components subscribe to via selectors.
 *
 * The inner panel is keyed on `presetName` so switching presets fully
 * re-seeds all slider defaults.
 */
export function ThemeControls() {
  const presetName = useThemeStore((s) => s.presetName);
  return (
    <>
      <Leva collapsed titleBar={{ title: 'Theme' }} />
      <InnerPanel key={presetName} />
    </>
  );
}

function InnerPanel() {
  const theme = useThemeStore.getState().theme;
  const update = useThemeStore((s) => s.updateTheme);
  const setPreset = useThemeStore((s) => s.setPreset);
  const currentPreset = useThemeStore.getState().presetName;

  useControls({
    Preset: {
      value: currentPreset,
      options: Object.keys(PRESETS) as PresetName[],
      onChange: (v: PresetName) => setPreset(v),
    },
  });

  useControls({
    Scene: folder(
      {
        background: {
          value: theme.background,
          onChange: (v: string) => update({ background: v }),
        },
        fogNear: {
          value: theme.fog.near, min: 2, max: 80, step: 1,
          onChange: (v: number) => update({ fog: { near: v } }),
        },
        fogFar: {
          value: theme.fog.far, min: 10, max: 200, step: 1,
          onChange: (v: number) => update({ fog: { far: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  useControls({
    Camera: folder(
      {
        tiltDeg: {
          value: theme.camera.tiltDeg, min: 0, max: 85, step: 1,
          onChange: (v: number) => update({ camera: { tiltDeg: v } }),
        },
        distance: {
          value: theme.camera.distance, min: 4, max: 24, step: 0.1,
          onChange: (v: number) => update({ camera: { distance: v } }),
        },
        offsetYFrac: {
          value: theme.camera.offsetYFrac, min: -0.5, max: 0.8, step: 0.01,
          onChange: (v: number) => update({ camera: { offsetYFrac: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  useControls({
    Piano: folder(
      {
        whiteBase: {
          value: theme.piano.whiteBase,
          onChange: (v: string) => update({ piano: { whiteBase: v } }),
        },
        blackBase: {
          value: theme.piano.blackBase,
          onChange: (v: string) => update({ piano: { blackBase: v } }),
        },
        pressGlow: {
          value: theme.piano.pressGlow,
          onChange: (v: string) => update({ piano: { pressGlow: v } }),
        },
        pressEmissiveIntensity: {
          value: theme.piano.pressEmissiveIntensity, min: 0, max: 4, step: 0.05,
          onChange: (v: number) => update({ piano: { pressEmissiveIntensity: v } }),
        },
        pressDepth: {
          value: theme.piano.pressDepth, min: 0, max: 0.2, step: 0.005,
          onChange: (v: number) => update({ piano: { pressDepth: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  useControls({
    Bars: folder(
      {
        colorTop: {
          value: theme.bars.colorTop,
          onChange: (v: string) => update({ bars: { colorTop: v } }),
        },
        colorBottom: {
          value: theme.bars.colorBottom,
          onChange: (v: string) => update({ bars: { colorBottom: v } }),
        },
        emissiveColor: {
          value: theme.bars.emissiveColor,
          onChange: (v: string) => update({ bars: { emissiveColor: v } }),
        },
        emissiveIntensity: {
          value: theme.bars.emissiveIntensity, min: 0, max: 3, step: 0.05,
          onChange: (v: number) => update({ bars: { emissiveIntensity: v } }),
        },
        roughness: {
          value: theme.bars.roughness, min: 0, max: 1, step: 0.02,
          onChange: (v: number) => update({ bars: { roughness: v } }),
        },
        metalness: {
          value: theme.bars.metalness, min: 0, max: 1, step: 0.02,
          onChange: (v: number) => update({ bars: { metalness: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  useControls({
    Particles: folder(
      {
        enabled: {
          value: theme.particles.enabled,
          onChange: (v: boolean) => update({ particles: { enabled: v } }),
        },
        color: {
          value: theme.particles.color,
          onChange: (v: string) => update({ particles: { color: v } }),
        },
        burstCount: {
          value: theme.particles.burstCount, min: 0, max: 48, step: 1,
          onChange: (v: number) => update({ particles: { burstCount: v } }),
        },
        gravityY: {
          value: theme.particles.gravityY, min: -8, max: 4, step: 0.1,
          onChange: (v: number) => update({ particles: { gravityY: v } }),
        },
        lifeMax: {
          value: theme.particles.lifeMax, min: 0.2, max: 3, step: 0.05,
          onChange: (v: number) => update({ particles: { lifeMax: v } }),
        },
        initialVelY: {
          value: theme.particles.initialVelY, min: 0, max: 6, step: 0.1,
          onChange: (v: number) => update({ particles: { initialVelY: v } }),
        },
        spread: {
          value: theme.particles.spread, min: 0, max: 1, step: 0.01,
          onChange: (v: number) => update({ particles: { spread: v } }),
        },
        size: {
          value: theme.particles.size, min: 4, max: 64, step: 1,
          onChange: (v: number) => update({ particles: { size: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  useControls({
    PostFX: folder(
      {
        bloomIntensity: {
          value: theme.postfx.bloomIntensity, min: 0, max: 3, step: 0.05,
          onChange: (v: number) => update({ postfx: { bloomIntensity: v } }),
        },
        bloomThreshold: {
          value: theme.postfx.bloomThreshold, min: 0, max: 1, step: 0.02,
          onChange: (v: number) => update({ postfx: { bloomThreshold: v } }),
        },
        bloomRadius: {
          value: theme.postfx.bloomRadius, min: 0, max: 1.5, step: 0.02,
          onChange: (v: number) => update({ postfx: { bloomRadius: v } }),
        },
        chromaticOffset: {
          value: theme.postfx.chromaticOffset, min: 0, max: 0.004, step: 0.0001,
          onChange: (v: number) => update({ postfx: { chromaticOffset: v } }),
        },
        vignetteDarkness: {
          value: theme.postfx.vignetteDarkness, min: 0, max: 1.2, step: 0.02,
          onChange: (v: number) => update({ postfx: { vignetteDarkness: v } }),
        },
      },
      { collapsed: true },
    ),
  });

  return null;
}
