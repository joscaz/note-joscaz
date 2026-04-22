import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { Box3, Color, MeshStandardMaterial, Vector3 } from 'three';
import { generatePianoKeys, type PianoKeyRef } from '../../utils/pianoModelMap';
import { audioEngine } from '../../services/audioEngine';
import { type InstrumentType } from '../../utils/noteColors';
import { useThemeStore } from '../../services/themeStore';

// Press dynamics (seconds-to-equilibrium time constants).
const ATTACK_TAU = 0.025;
const RELEASE_TAU = 0.15;

export interface PianoHandle {
  keys: PianoKeyRef[];
  modelWidth: number;
  modelCenterX: number;
  keyYSurface: number;
  getKeyXByMidi: (midi: number) => number | null;
  getKeyYByMidi: (midi: number) => number | null;
  getKeyZByMidi: (midi: number) => number | null;
}

interface PianoProps {
  instrument: InstrumentType;
  onReady?: (handle: PianoHandle) => void;
}

/**
 * Procedurally generates an 88-key piano, properly mapping MIDI numbers
 * and enforcing the 2-3 black key pattern.
 *
 * Per-key press amount is integrated in a local array (not React state) so
 * the 60Hz animation doesn't trigger re-renders.
 */
export function Piano({ instrument, onReady }: PianoProps) {
  const groupRef = useRef<Group>(null);

  const keys = useMemo(() => generatePianoKeys(), []);

  const whiteBase = useThemeStore((s) => s.theme.piano.whiteBase);
  const blackBase = useThemeStore((s) => s.theme.piano.blackBase);
  const pressGlow = useThemeStore((s) => s.theme.piano.pressGlow);

  const keyStateRef = useRef<
    Array<{
      mesh: Mesh;
      material: MeshStandardMaterial;
      baseEmissive: Color;
      activeEmissive: Color;
      restY: number;
      press: number;
    }>
  >([]);

  useEffect(() => {
    for (const prev of keyStateRef.current) prev.material.dispose();

    const active = new Color(pressGlow);
    const white = new Color(whiteBase);
    const black = new Color(blackBase);
    keyStateRef.current = keys.map((k) => {
      const mesh = k.object as Mesh;
      const baseColor = k.isBlack ? black.clone() : white.clone();
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
  }, [keys, instrument, whiteBase, blackBase, pressGlow]);

  const activeRef = useRef<Set<number>>(new Set());
  useEffect(() => audioEngine.onActiveNotes((set) => { activeRef.current = set; }), []);

  useFrame((_, delta) => {
    const active = activeRef.current;
    const state = keyStateRef.current;
    if (state.length === 0) return;
    const pianoTheme = useThemeStore.getState().theme.piano;
    const intensity = pianoTheme.pressEmissiveIntensity;
    const depth = pianoTheme.pressDepth;
    for (let i = 0; i < state.length; i++) {
      const entry = state[i];
      const midi = keys[i].midi;
      const target = active.has(midi) ? 1 : 0;
      const tau = target === 1 ? ATTACK_TAU : RELEASE_TAU;
      const alpha = 1 - Math.exp(-delta / tau);
      entry.press += (target - entry.press) * alpha;

      entry.mesh.position.y = entry.restY - entry.press * depth;
      entry.material.emissiveIntensity = entry.press * intensity;
      if (entry.press > 0.01) {
        entry.material.emissive.copy(entry.activeEmissive);
      } else {
        entry.material.emissive.copy(entry.baseEmissive);
      }
    }
  });

  useEffect(() => {
    if (!groupRef.current || !onReady) return;
    const group = groupRef.current;

    group.updateMatrixWorld(true);

    const bbox = new Box3().setFromObject(group);
    const size = new Vector3();
    bbox.getSize(size);

    const keyXByMidi = new Map<number, number>();
    const keyYByMidi = new Map<number, number>();
    const keyZByMidi = new Map<number, number>();

    let backOfKeysZ = Infinity;
    const keyBoxes = keys.map(k => new Box3().setFromObject(k.object));
    for (const box of keyBoxes) {
      if (box.min.z < backOfKeysZ) backOfKeysZ = box.min.z;
    }

    for (let i = 0; i < keys.length; i++) {
      const c = new Vector3();
      keyBoxes[i].getCenter(c);
      keyXByMidi.set(keys[i].midi, c.x);
      keyYByMidi.set(keys[i].midi, keyBoxes[i].max.y);
      keyZByMidi.set(keys[i].midi, backOfKeysZ);
    }

    const center = new Vector3();
    bbox.getCenter(center);

    onReady({
      keys,
      modelWidth: size.x,
      modelCenterX: center.x,
      keyYSurface: bbox.max.y,
      getKeyXByMidi: (midi) => keyXByMidi.get(midi) ?? null,
      getKeyYByMidi: (midi) => keyYByMidi.get(midi) ?? null,
      getKeyZByMidi: (midi) => keyZByMidi.get(midi) ?? null,
    });
  }, [keys, onReady]);

  return (
    <group ref={groupRef}>
      {keys.map((k) => (
        <primitive key={k.midi} object={k.object} />
      ))}
    </group>
  );
}
