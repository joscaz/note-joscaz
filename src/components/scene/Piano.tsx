import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, Object3D } from 'three';
import { Box3, Color, MeshStandardMaterial, Vector3 } from 'three';
import { mapKeysByMidi, type PianoKeyRef } from '../../utils/pianoModelMap';
import { audioEngine } from '../../services/audioEngine';
import { NOTE_GRADIENTS, type InstrumentType } from '../../utils/noteColors';

const MODEL_URL = '/models/piano.glb';
useGLTF.preload(MODEL_URL);

// Press dynamics (seconds-to-equilibrium time constants).
const ATTACK_TAU = 0.025;  // fast downstroke
const RELEASE_TAU = 0.15;  // slower return
const PRESS_DEPTH_Y = 1.5; // model-space units (≈1.5mm) — scaled by group 0.01

export interface PianoHandle {
  keys: PianoKeyRef[];
  modelWidth: number;
  keyYSurface: number;
  getKeyXByMidi: (midi: number) => number | null;
}

interface PianoProps {
  instrument: InstrumentType;
  onReady?: (handle: PianoHandle) => void;
}

/**
 * Loads piano.glb, assigns MIDI numbers by X-sorted mesh position, and
 * animates key-press depression + emissive glow in lockstep with
 * `audioEngine.onActiveNotes`.
 *
 * Per-key press amount is integrated in a local array (not React state) so
 * the 60Hz animation doesn't trigger re-renders.
 */
export function Piano({ instrument, onReady }: PianoProps) {
  const gltf = useGLTF(MODEL_URL);
  const groupRef = useRef<Group>(null);

  // Clone the scene so multiple mounts never mutate the cached asset.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const keys = useMemo(() => mapKeysByMidi(scene), [scene]);

  // Swap each key mesh to a MeshStandardMaterial we own (emissive slot
  // available, base color preserved). Also cache the rest Y so press
  // animation returns to the true origin.
  const keyStateRef = useRef<
    Array<{
      mesh: Mesh;
      material: MeshStandardMaterial;
      baseEmissive: Color;
      activeEmissive: Color;
      restY: number;
      press: number; // 0..1
    }>
  >([]);

  useEffect(() => {
    // Dispose of previously-owned materials before rebuilding.
    for (const prev of keyStateRef.current) prev.material.dispose();

    const active = new Color(NOTE_GRADIENTS[instrument].top);
    keyStateRef.current = keys.map((k) => {
      const mesh = k.object as Mesh;
      const prev = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const baseColor = (prev as { color?: Color })?.color?.clone() ?? new Color(k.isBlack ? 0x111111 : 0xf5f5f5);
      const mat = new MeshStandardMaterial({
        color: baseColor,
        roughness: k.isBlack ? 0.35 : 0.45,
        metalness: 0.05,
        emissive: new Color(0x000000),
        emissiveIntensity: 0,
      });
      mesh.material = mat;
      return {
        mesh,
        material: mat,
        baseEmissive: new Color(0x000000),
        activeEmissive: active.clone(),
        restY: mesh.position.y,
        press: 0,
      };
    });
  }, [keys, instrument]);

  // Subscribe to active-notes set; store Set ref for the useFrame loop.
  const activeRef = useRef<Set<number>>(new Set());
  useEffect(() => audioEngine.onActiveNotes((set) => { activeRef.current = set; }), []);

  useFrame((_, delta) => {
    const active = activeRef.current;
    const state = keyStateRef.current;
    if (state.length === 0) return;
    for (let i = 0; i < state.length; i++) {
      const entry = state[i];
      const midi = keys[i].midi;
      const target = active.has(midi) ? 1 : 0;
      const tau = target === 1 ? ATTACK_TAU : RELEASE_TAU;
      const alpha = 1 - Math.exp(-delta / tau);
      entry.press += (target - entry.press) * alpha;

      entry.mesh.position.y = entry.restY - entry.press * PRESS_DEPTH_Y;
      entry.material.emissiveIntensity = entry.press * 1.4;
      if (entry.press > 0.01) {
        entry.material.emissive.copy(entry.activeEmissive);
      }
    }
  });

  useEffect(() => {
    if (!groupRef.current || !onReady) return;
    const group = groupRef.current;
    const bbox = new Box3().setFromObject(group);
    const size = new Vector3();
    bbox.getSize(size);

    const keyXByMidi = new Map<number, number>();
    for (const k of keys) {
      const c = new Vector3();
      new Box3().setFromObject(k.object).getCenter(c);
      keyXByMidi.set(k.midi, c.x);
    }

    onReady({
      keys,
      modelWidth: size.x,
      keyYSurface: bbox.max.y,
      getKeyXByMidi: (midi) => keyXByMidi.get(midi) ?? null,
    });
  }, [keys, onReady]);

  return (
    <group ref={groupRef} scale={0.01} position={[-6.6, 0, 0]}>
      <primitive object={scene as Object3D} />
    </group>
  );
}
