import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh as ThreeInstancedMesh } from 'three';
import * as Tone from 'tone';
import type { NoteEvent } from '../../services/audioEngine';
import { NOTE_GRADIENTS, type InstrumentType } from '../../utils/noteColors';
import { isBlackKey } from '../../utils/musicTheory';
import type { PianoHandle } from './Piano';

interface Props {
  notes: readonly NoteEvent[];
  pianoHandle: PianoHandle;
  instrument: InstrumentType;
  scrollSpeed: number; // scene units per second
  lookAheadSeconds?: number;
}

const WHITE_BAR_WIDTH = 0.22;
const BLACK_BAR_WIDTH = 0.14;
const BAR_DEPTH = 0.22;

/**
 * One InstancedMesh for every note in the song. Each frame we recompute the
 * bar's Y from `Tone.Transport.seconds` so playback pause/scrub/loop all
 * sync automatically — same invariant the 2D roll relied on, lifted to 3D.
 *
 * X and color are static per-note; only the matrix is updated each frame.
 * Bars outside the visible window collapse to scale 0 (no draw cost in the
 * fragment shader but still iterated — swap to a sorted windowed update in
 * the perf pass if note count grows into the tens of thousands).
 */
export function FallingBars({
  notes,
  pianoHandle,
  instrument,
  scrollSpeed,
  lookAheadSeconds = 6,
}: Props) {
  const meshRef = useRef<ThreeInstancedMesh>(null);
  const count = notes.length;
  const dummy = useRef(new Object3D()).current;

  // Per-instance static data — X position + bar width per note.
  const instanceX = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = pianoHandle.getKeyXByMidi(notes[i].midi);
      arr[i] = x ?? -9999; // out-of-range notes parked far off-screen
    }
    return arr;
  }, [notes, pianoHandle, count]);

  const instanceZ = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = pianoHandle.getKeyZByMidi(notes[i].midi);
      // Fallback to 0 if out of range, though it will be parked offscreen anyway
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

  // Per-instance color — velocity-modulated lerp between gradient endpoints.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const grad = NOTE_GRADIENTS[instrument];
    const top = new Color(grad.top);
    const bottom = new Color(grad.bottom);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const v = Math.max(0.3, Math.min(1, notes[i].velocity));
      c.copy(bottom).lerp(top, v);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [notes, instrument, count]);

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
        // Clamp bottomY to the specific key's hit surface so white and black keys align perfectly
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

  // Key on count so a different-length MIDI triggers a clean remount
  // (InstancedMesh capacity is fixed at construction).
  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        emissive={new Color(NOTE_GRADIENTS[instrument].top)}
        emissiveIntensity={0.6}
        roughness={0.3}
        metalness={0.15}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
