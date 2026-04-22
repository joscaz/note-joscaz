import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { Vector2 } from 'three';

interface Props {
  bloomIntensity?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  vignetteDarkness?: number;
  chromaticOffset?: number;
}

/**
 * Post-processing stack. `mipmapBlur` is the cheap, modern bloom path —
 * avoids the selective-bloom complexity while still only "lighting up"
 * pixels brighter than `luminanceThreshold`. Since our bars + pressed keys
 * use `toneMapped={false}` + emissive intensity > 1, they'll cross the
 * threshold and bloom, while matte piano body + fog stay clean.
 */
export function PostFX({
  bloomIntensity = 0.9,
  bloomThreshold = 0.45,
  bloomRadius = 0.75,
  vignetteDarkness = 0.6,
  chromaticOffset = 0.0006,
}: Props) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.2}
        radius={bloomRadius}
        kernelSize={KernelSize.LARGE}
      />
      <ChromaticAberration
        offset={new Vector2(chromaticOffset, chromaticOffset)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette
        eskil={false}
        offset={0.35}
        darkness={vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
