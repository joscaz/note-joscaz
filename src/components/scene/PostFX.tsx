import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { Vector2 } from 'three';
import { useThemeStore } from '../../services/themeStore';

/**
 * Post-processing stack. `mipmapBlur` is the cheap, modern bloom path —
 * pixels brighter than `luminanceThreshold` bloom, matte body + fog stay clean.
 */
export function PostFX() {
  const postfx = useThemeStore((s) => s.theme.postfx);
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        intensity={postfx.bloomIntensity}
        luminanceThreshold={postfx.bloomThreshold}
        luminanceSmoothing={0.2}
        radius={postfx.bloomRadius}
        kernelSize={KernelSize.LARGE}
      />
      <ChromaticAberration
        offset={new Vector2(postfx.chromaticOffset, postfx.chromaticOffset)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette
        eskil={false}
        offset={0.35}
        darkness={postfx.vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
