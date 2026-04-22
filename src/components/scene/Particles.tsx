import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { audioEngine } from '../../services/audioEngine';
import { NOTE_GRADIENTS, type InstrumentType } from '../../utils/noteColors';
import type { PianoHandle } from './Piano';

interface Props {
  pianoHandle: PianoHandle;
  instrument: InstrumentType;
  poolSize?: number;
  burstCount?: number;
}

/**
 * Spark-burst particle system. GPU-driven: attributes are written only at
 * emit time; position is computed per-vertex from (birthPos + vel*age +
 * 0.5*g*age²) in the vertex shader. No per-frame CPU writes.
 *
 * Emission fires on the note-on edge — diffed against the previous active
 * set pulled from `audioEngine.onActiveNotes`.
 */
export function Particles({
  pianoHandle,
  instrument,
  poolSize = 1024,
  burstCount = 10,
}: Props) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const writeCursorRef = useRef(0);
  const prevActiveRef = useRef<Set<number>>(new Set());
  const clockRef = useRef({ t: 0 });

  // Allocate buffers once per pool size.
  const geom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(poolSize * 3), 3));
    g.setAttribute('aVelocity', new BufferAttribute(new Float32Array(poolSize * 3), 3));
    g.setAttribute('aBirth', new BufferAttribute(new Float32Array(poolSize), 1));
    g.setAttribute('aLife', new BufferAttribute(new Float32Array(poolSize), 1));
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(poolSize), 1));
    // Pre-mark all particles as dead so they don't render at origin before
    // any emit: aBirth = -1000, aLife = 0.
    const birth = g.getAttribute('aBirth') as BufferAttribute;
    for (let i = 0; i < poolSize; i++) birth.setX(i, -1000);
    birth.needsUpdate = true;
    return g;
  }, [poolSize]);

  const material = useMemo(() => {
    const color = new Color(NOTE_GRADIENTS[instrument].top);
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color },
        uSize: { value: 22 },
        uGravity: { value: new Vector3(0, -2.4, 0) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVelocity;
        attribute float aBirth;
        attribute float aLife;
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        uniform vec3 uGravity;
        varying float vAge01;
        void main() {
          float age = uTime - aBirth;
          float ageN = clamp(age / aLife, 0.0, 1.0);
          vAge01 = ageN;
          vec3 pos = position + aVelocity * age + 0.5 * uGravity * age * age;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float sizeMul = (age < 0.0 || age > aLife) ? 0.0 : (1.0 - ageN * 0.6);
          gl_PointSize = uSize * sizeMul * (1.0 / -mv.z) * 30.0;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAge01;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d);
          alpha *= (1.0 - vAge01);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(uColor * (1.6 + (1.0 - vAge01) * 1.5), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }, [instrument]);

  // Dispose on unmount / regen.
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => () => { geom.dispose(); }, [geom]);

  // Subscribe to active set; emit on rising edges.
  useEffect(() => {
    return audioEngine.onActiveNotes((active) => {
      const prev = prevActiveRef.current;
      const now = clockRef.current.t;
      const posAttr = geom.getAttribute('position') as BufferAttribute;
      const velAttr = geom.getAttribute('aVelocity') as BufferAttribute;
      const birthAttr = geom.getAttribute('aBirth') as BufferAttribute;
      const lifeAttr = geom.getAttribute('aLife') as BufferAttribute;
      const seedAttr = geom.getAttribute('aSeed') as BufferAttribute;

      let dirty = false;
      for (const midi of active) {
        if (prev.has(midi)) continue;
        const x = pianoHandle.getKeyXByMidi(midi);
        if (x == null) continue;
        const y = pianoHandle.keyYSurface;
        for (let i = 0; i < burstCount; i++) {
          const idx = writeCursorRef.current;
          writeCursorRef.current = (writeCursorRef.current + 1) % poolSize;
          const angle = Math.random() * Math.PI * 2;
          const radial = 0.4 + Math.random() * 1.0;
          const vx = Math.cos(angle) * radial * 0.3;
          const vz = Math.sin(angle) * radial * 0.3;
          const vy = 1.0 + Math.random() * 1.8;
          posAttr.setXYZ(idx, x, y, 0);
          velAttr.setXYZ(idx, vx, vy, vz);
          birthAttr.setX(idx, now);
          lifeAttr.setX(idx, 0.7 + Math.random() * 0.5);
          seedAttr.setX(idx, Math.random());
          dirty = true;
        }
      }
      if (dirty) {
        posAttr.needsUpdate = true;
        velAttr.needsUpdate = true;
        birthAttr.needsUpdate = true;
        lifeAttr.needsUpdate = true;
        seedAttr.needsUpdate = true;
      }

      // Snapshot for next edge diff.
      prevActiveRef.current = new Set(active);
    });
  }, [geom, pianoHandle, burstCount, poolSize]);

  useFrame((_, delta) => {
    clockRef.current.t += delta;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clockRef.current.t;
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <primitive attach="geometry" object={geom} />
      <primitive attach="material" object={material} ref={materialRef} />
    </points>
  );
}
