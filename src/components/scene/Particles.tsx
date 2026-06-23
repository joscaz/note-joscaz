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
import * as Tone from 'tone';
import { type InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';
import type { PianoHandle } from './Piano';
import { useThemeStore } from '../../services/themeStore';
import { useGraphicsStore } from '../../services/graphicsStore';

interface Props {
  pianoHandle: PianoHandle;
  instrument: InstrumentType;
  /**
   * Same note list FallingBars renders from. Particles derives note-onset
   * bursts from this + Tone.getTransport().seconds directly (see useFrame
   * below) instead of subscribing to audioEngine's live-only rAF ticker —
   * required so bursts are deterministic during export (design: the scene
   * must be a pure function of transport time, no real rAF in the trigger
   * path; see exportRenderer.ts's doc comment and FallingBars).
   */
  notes: readonly NoteEvent[];
  /**
   * Export-time override (see Scene.tsx ExportGraphicsOverride): when set,
   * forces particles on/off and overrides pool size instead of reading the
   * live useGraphicsStore. Forced ON for every export tier (design §4/§7) —
   * the live thermal preset must never thin out the exported video.
   */
  forceEnabled?: boolean;
  forcePoolSize?: number;
}

/**
 * mulberry32 — tiny, dependency-free deterministic PRNG. Seeded per-burst
 * from a hash of (note index, note.time, note.midi) so the exact same MIDI
 * always produces bit-identical bursts across export runs/machines, while
 * still looking like independent randomness within a single burst.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a few floats/ints — used to seed mulberry32. */
function hashSeed(noteIndex: number, time: number, midi: number): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= Math.floor(n * 1000) | 0;
    h = Math.imul(h, 0x01000193);
  };
  mix(noteIndex);
  mix(time);
  mix(midi);
  return h >>> 0;
}

/**
 * Spark-burst particle system. GPU-driven: attributes are written only at
 * emit time; position is computed per-vertex from (birthPos + vel*age +
 * 0.5*g*age²) in the vertex shader. No per-frame CPU writes.
 */
export function Particles({ pianoHandle, notes, forceEnabled, forcePoolSize }: Props) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const writeCursorRef = useRef(0);
  // Per-note "has this onset already spawned its burst" flag, indexed by
  // position in `notes` — deterministic alternative to the previous
  // Set<midi>-diff-against-the-previous-rAF-tick approach. Reset whenever
  // `notes` changes (new piece) or the transport seeks backward (replay).
  const burstedRef = useRef<Uint8Array>(new Uint8Array(0));
  const lastTRef = useRef(0);

  const liveEnabled = useGraphicsStore((s) => s.enableParticles);
  const livePoolSize = useGraphicsStore((s) => s.particlePoolSize);
  const enabled = forceEnabled ?? liveEnabled;
  const poolSize = forcePoolSize ?? livePoolSize;
  const particleColor = useThemeStore((s) => s.theme.particles.color);
  const particleSize = useThemeStore((s) => s.theme.particles.size);
  const gravityY = useThemeStore((s) => s.theme.particles.gravityY);

  const geom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(poolSize * 3), 3));
    g.setAttribute('aVelocity', new BufferAttribute(new Float32Array(poolSize * 3), 3));
    g.setAttribute('aBirth', new BufferAttribute(new Float32Array(poolSize), 1));
    g.setAttribute('aLife', new BufferAttribute(new Float32Array(poolSize), 1));
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(poolSize), 1));
    const birth = g.getAttribute('aBirth') as BufferAttribute;
    for (let i = 0; i < poolSize; i++) birth.setX(i, -1000);
    birth.needsUpdate = true;
    return g;
  }, [poolSize]);

  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(particleColor) },
        uSize: { value: particleSize },
        uGravity: { value: new Vector3(0, gravityY, 0) },
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
  }, []);

  useEffect(() => {
    material.uniforms.uColor.value = new Color(particleColor);
  }, [material, particleColor]);

  useEffect(() => {
    material.uniforms.uSize.value = particleSize;
  }, [material, particleSize]);

  useEffect(() => {
    (material.uniforms.uGravity.value as Vector3).set(0, gravityY, 0);
  }, [material, gravityY]);

  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => () => { geom.dispose(); }, [geom]);

  // Reset onset-tracking whenever the note list changes (new piece) so a
  // stale bursted-flags array from the previous song doesn't suppress every
  // burst, or a shorter array overruns. Also resets the seek-rewind cursor.
  useEffect(() => {
    burstedRef.current = new Uint8Array(notes.length);
    lastTRef.current = -Infinity;
  }, [notes]);

  useFrame(() => {
    // Pure function of transport time — same invariant FallingBars relies on
    // (no accumulated wall-clock delta, no real-rAF dependency). This makes
    // uTime (particle age/fade) and burst triggering both deterministic
    // under exportRenderer's synchronous set(transport.seconds)+advance()
    // loop, and behaves identically live since transport.seconds already
    // advances in real time during normal playback.
    const t = Tone.getTransport().seconds;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
    }

    if (enabled) {
      // lastTRef is tracked only while enabled (uTime above updates every
      // frame regardless). This keeps prevT frozen across a pause, so a
      // forward resume reads t >= prevT (no false reset) while a backward
      // seek made during the pause still reads t < prevT and re-arms bursts.
      const prevT = lastTRef.current;
      lastTRef.current = t;

      // Seek backward (rewind/loop restart) — clear bursted flags so notes
      // before the new playhead can burst again on a future pass, exactly
      // like FallingBars' position recompute handles seeks implicitly.
      if (t < prevT) {
        burstedRef.current.fill(0);
      }

      const bursted = burstedRef.current;
      if (bursted.length === notes.length) {
        const p = useThemeStore.getState().theme.particles;
        const posAttr = geom.getAttribute('position') as BufferAttribute;
        const velAttr = geom.getAttribute('aVelocity') as BufferAttribute;
        const birthAttr = geom.getAttribute('aBirth') as BufferAttribute;
        const lifeAttr = geom.getAttribute('aLife') as BufferAttribute;
        const seedAttr = geom.getAttribute('aSeed') as BufferAttribute;

        let dirty = false;
        for (let n = 0; n < notes.length; n++) {
          if (bursted[n]) continue;
          const note = notes[n];
          if (note.time > t) continue; // not started yet
          // Note has started (note.time <= t) and hasn't bursted: fire now,
          // regardless of how far past onset we are (handles export's
          // discrete frame steps, which may land slightly after note.time).
          bursted[n] = 1;

          const x = pianoHandle.getKeyXByMidi(note.midi);
          if (x == null) continue;
          const y = pianoHandle.keyYSurface;
          const rng = mulberry32(hashSeed(n, note.time, note.midi));
          for (let i = 0; i < p.burstCount; i++) {
            const idx = writeCursorRef.current;
            writeCursorRef.current = (writeCursorRef.current + 1) % poolSize;
            const angle = rng() * Math.PI * 2;
            const radial = (0.4 + rng() * 1.0) * p.spread;
            const vx = Math.cos(angle) * radial;
            const vz = Math.sin(angle) * radial;
            const vy = p.initialVelY * (0.6 + rng() * 0.8);
            posAttr.setXYZ(idx, x, y, 0);
            velAttr.setXYZ(idx, vx, vy, vz);
            birthAttr.setX(idx, note.time);
            lifeAttr.setX(idx, p.lifeMin + rng() * (p.lifeMax - p.lifeMin));
            seedAttr.setX(idx, rng());
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
      }
    }
  });

  if (!enabled) return null;

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <primitive attach="geometry" object={geom} />
      <primitive attach="material" object={material} ref={materialRef} />
    </points>
  );
}
