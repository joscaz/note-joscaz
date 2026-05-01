import { useControls, useCreateStore, LevaPanel, folder } from 'leva';
import { useThemeStore } from '../../services/themeStore';
import type { PresetName } from '../../types/theme';
import { PRESETS } from '../../themes/presets';
import { useState } from 'react';

/**
 * Leva-driven live tuning panel.
 *
 * Preset-switching resets Leva via component remount (`key={presetName}` on
 * InnerPanel) PAIRED WITH a fresh scoped Leva store from `useCreateStore`.
 * The scoped store is discarded on unmount, so the next preset registers
 * its controls with clean defaults — dodging Leva's global-store
 * persistence that would otherwise replay stale values into onChange and
 * clobber the preset via deepMerge.
 */
export function ThemeControls() {
  const presetName = useThemeStore((s) => s.presetName);
  return <InnerPanel key={presetName} />;
}

function InnerPanel() {
  const store = useCreateStore();
  const t = useThemeStore.getState().theme;
  const presetName = useThemeStore.getState().presetName;
  const update = useThemeStore.getState().updateTheme;
  const setPreset = useThemeStore.getState().setPreset;
  const [panelPos, setPanelPos] = useState({ x: 0, y: 50 });

  useControls(
    () => ({
      Preset: {
        value: presetName,
        options: Object.keys(PRESETS) as PresetName[],
        onChange: (v: PresetName) => {
          if (v !== useThemeStore.getState().presetName) setPreset(v);
        },
      },
      Scene: folder(
        {
          background: {
            value: t.background,
            onChange: (v: string) => update({ background: v }),
          },
          fogNear: {
            value: t.fog.near, min: 2, max: 80, step: 1,
            onChange: (v: number) => update({ fog: { near: v } }),
          },
          fogFar: {
            value: t.fog.far, min: 10, max: 200, step: 1,
            onChange: (v: number) => update({ fog: { far: v } }),
          },
        },
        { collapsed: true },
      ),
      Camera: folder(
        {
          tiltDeg: {
            value: t.camera.tiltDeg, min: 0, max: 85, step: 1,
            onChange: (v: number) => update({ camera: { tiltDeg: v } }),
          },
          distance: {
            value: t.camera.distance, min: 4, max: 24, step: 0.1,
            onChange: (v: number) => update({ camera: { distance: v } }),
          },
          offsetYFrac: {
            value: t.camera.offsetYFrac, min: -0.5, max: 0.8, step: 0.01,
            onChange: (v: number) => update({ camera: { offsetYFrac: v } }),
          },
        },
        { collapsed: true },
      ),
      Piano: folder(
        {
          whiteBase: {
            value: t.piano.whiteBase,
            onChange: (v: string) => update({ piano: { whiteBase: v } }),
          },
          blackBase: {
            value: t.piano.blackBase,
            onChange: (v: string) => update({ piano: { blackBase: v } }),
          },
          pressGlow: {
            value: t.piano.pressGlow,
            onChange: (v: string) => update({ piano: { pressGlow: v } }),
          },
          pressEmissiveIntensity: {
            value: t.piano.pressEmissiveIntensity, min: 0, max: 4, step: 0.05,
            onChange: (v: number) => update({ piano: { pressEmissiveIntensity: v } }),
          },
          pressDepth: {
            value: t.piano.pressDepth, min: 0, max: 0.2, step: 0.005,
            onChange: (v: number) => update({ piano: { pressDepth: v } }),
          },
        },
        { collapsed: true },
      ),
      Bars: folder(
        {
          colorTop: {
            value: t.bars.colorTop,
            onChange: (v: string) => update({ bars: { colorTop: v } }),
          },
          colorBottom: {
            value: t.bars.colorBottom,
            onChange: (v: string) => update({ bars: { colorBottom: v } }),
          },
          emissiveColor: {
            value: t.bars.emissiveColor,
            onChange: (v: string) => update({ bars: { emissiveColor: v } }),
          },
          emissiveIntensity: {
            value: t.bars.emissiveIntensity, min: 0, max: 3, step: 0.05,
            onChange: (v: number) => update({ bars: { emissiveIntensity: v } }),
          },
          roughness: {
            value: t.bars.roughness, min: 0, max: 1, step: 0.02,
            onChange: (v: number) => update({ bars: { roughness: v } }),
          },
          metalness: {
            value: t.bars.metalness, min: 0, max: 1, step: 0.02,
            onChange: (v: number) => update({ bars: { metalness: v } }),
          },
        },
        { collapsed: true },
      ),
      Particles: folder(
        {
          enabled: {
            value: t.particles.enabled,
            onChange: (v: boolean) => update({ particles: { enabled: v } }),
          },
          color: {
            value: t.particles.color,
            onChange: (v: string) => update({ particles: { color: v } }),
          },
          burstCount: {
            value: t.particles.burstCount, min: 0, max: 48, step: 1,
            onChange: (v: number) => update({ particles: { burstCount: v } }),
          },
          gravityY: {
            value: t.particles.gravityY, min: -8, max: 4, step: 0.1,
            onChange: (v: number) => update({ particles: { gravityY: v } }),
          },
          lifeMax: {
            value: t.particles.lifeMax, min: 0.2, max: 3, step: 0.05,
            onChange: (v: number) => update({ particles: { lifeMax: v } }),
          },
          initialVelY: {
            value: t.particles.initialVelY, min: 0, max: 6, step: 0.1,
            onChange: (v: number) => update({ particles: { initialVelY: v } }),
          },
          spread: {
            value: t.particles.spread, min: 0, max: 1, step: 0.01,
            onChange: (v: number) => update({ particles: { spread: v } }),
          },
          size: {
            value: t.particles.size, min: 4, max: 64, step: 1,
            onChange: (v: number) => update({ particles: { size: v } }),
          },
        },
        { collapsed: true },
      ),
      PostFX: folder(
        {
          bloomIntensity: {
            value: t.postfx.bloomIntensity, min: 0, max: 3, step: 0.05,
            onChange: (v: number) => update({ postfx: { bloomIntensity: v } }),
          },
          bloomThreshold: {
            value: t.postfx.bloomThreshold, min: 0, max: 1, step: 0.02,
            onChange: (v: number) => update({ postfx: { bloomThreshold: v } }),
          },
          bloomRadius: {
            value: t.postfx.bloomRadius, min: 0, max: 1.5, step: 0.02,
            onChange: (v: number) => update({ postfx: { bloomRadius: v } }),
          },
          chromaticOffset: {
            value: t.postfx.chromaticOffset, min: 0, max: 0.004, step: 0.0001,
            onChange: (v: number) => update({ postfx: { chromaticOffset: v } }),
          },
          vignetteDarkness: {
            value: t.postfx.vignetteDarkness, min: 0, max: 1.2, step: 0.02,
            onChange: (v: number) => update({ postfx: { vignetteDarkness: v } }),
          },
        },
        { collapsed: true },
      ),
    }),
    { store },
  );

  return (
      <LevaPanel
        store={store}
        fill={false}
        flat={false}
        collapsed
        titleBar={{
          title: 'Theme',
          position: panelPos,
          onDragEnd: (pos) => setPanelPos({
            x: pos.x ?? panelPos.x,
            y: pos.y ?? panelPos.y,
          })
        }}
      />
  );
}
