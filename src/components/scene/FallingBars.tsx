import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, MeshStandardMaterial, type InstancedMesh as ThreeInstancedMesh } from 'three';
import * as Tone from 'tone';
import type { NoteEvent } from '../../services/audioEngine';

import { isBlackKey } from '../../utils/musicTheory';
import type { PianoHandle } from './Piano';
import { useThemeStore } from '../../services/themeStore';

interface Props {
  notes: readonly NoteEvent[];
  pianoHandle: PianoHandle;
  scrollSpeed: number;
  lookAheadSeconds?: number;
}

const WHITE_BAR_WIDTH = 0.22;
const BLACK_BAR_WIDTH = 0.14;
const BAR_DEPTH = 0.22;

/**
 * One InstancedMesh for every note in the song. Each frame we recompute the
 * bar's Y from `Tone.Transport.seconds` so playback pause/scrub/loop all
 * sync automatically — same invariant the 2D roll relied on, lifted to 3D.
 */
export function FallingBars({
  notes,
  pianoHandle,
  scrollSpeed,
  lookAheadSeconds = 6,
}: Props) {
  const meshRef = useRef<ThreeInstancedMesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const count = notes.length;
  const dummy = useRef(new Object3D()).current;

  const bars = useThemeStore((s) => s.theme.bars);

  const instanceX = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = pianoHandle.getKeyXByMidi(notes[i].midi);
      arr[i] = x ?? -9999;
    }
    return arr;
  }, [notes, pianoHandle, count]);

  const instanceZ = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = pianoHandle.getKeyZByMidi(notes[i].midi);
      arr[i] = z ?? 0;
    }
    return arr;
  }, [notes, pianoHandle, count]);

  const instanceHitY = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const y = pianoHandle.getKeyYByMidi(notes[i].midi);
      arr[i] = y ?? pianoHandle.keyYSurface;
    }
    return arr;
  }, [notes, pianoHandle, count]);

  const instanceWidth = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = isBlackKey(notes[i].midi) ? BLACK_BAR_WIDTH : WHITE_BAR_WIDTH;
    }
    return arr;
  }, [notes, count]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const top = new Color(bars.colorTop);
    const bottom = new Color(bars.colorBottom);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const v = Math.max(0.3, Math.min(1, notes[i].velocity));
      c.copy(bottom).lerp(top, v);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [notes, count, bars.colorTop, bars.colorBottom]);

  useLayoutEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.emissive.set(bars.emissiveColor);
    mat.emissiveIntensity = bars.emissiveIntensity;
    mat.roughness = bars.roughness;
    mat.metalness = bars.metalness;
    mat.needsUpdate = true;
  }, [bars.emissiveColor, bars.emissiveIntensity, bars.roughness, bars.metalness]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = Tone.getTransport().seconds;

    for (let i = 0; i < count; i++) {
      const note = notes[i];
      const dt0 = note.time - t;
      const dt1 = note.time + note.duration - t;
      const hit = instanceHitY[i];

      if (dt1 < -0.1 || dt0 > lookAheadSeconds) {
        dummy.position.set(0, -1000, 0);
        dummy.scale.set(0, 0, 0);
      } else {
        const bottomY = Math.max(hit, hit + dt0 * scrollSpeed);
        const topY = hit + dt1 * scrollSpeed;
        const height = Math.max(0.015, topY - bottomY);
        dummy.position.set(instanceX[i], (bottomY + topY) / 2, instanceZ[i]);
        dummy.scale.set(instanceWidth[i], height, BAR_DEPTH);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        emissive={new Color(bars.emissiveColor)}
        emissiveIntensity={bars.emissiveIntensity}
        roughness={bars.roughness}
        metalness={bars.metalness}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
