import type { Object3D, Mesh } from 'three';
import { Box3, Vector3 } from 'three';

/**
 * Piano model from /public/models/piano.glb has 80 keys spanning MIDI 36..115
 * (C2..D#8). Keys are unnamed in the glb, so we identify them at load time by
 * sorting mesh children along world X and assigning MIDI numbers sequentially.
 *
 * The model also distinguishes white vs black keys by vertical bounding box:
 * whites sit at Y=0..17, blacks sit at Y=13..30. We do not rely on this for
 * mapping (X-order alone determines pitch) but surface the flag for visuals.
 */

export const MODEL_MIDI_LOW = 36;   // C2 — leftmost key in the glb
export const MODEL_MIDI_HIGH = 115; // D#8 — rightmost key in the glb
export const MODEL_KEY_COUNT = MODEL_MIDI_HIGH - MODEL_MIDI_LOW + 1; // 80

export interface PianoKeyRef {
  midi: number;
  object: Object3D;
  restRotationX: number;
  localCenter: Vector3; // center of key's geometry in world space at load time
  isBlack: boolean;
}

/**
 * Walk a loaded glTF scene and return one entry per key mesh, sorted by
 * world X (ascending = lowest pitch first).
 */
export function mapKeysByMidi(root: Object3D): PianoKeyRef[] {
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as Mesh).isMesh) meshes.push(obj as Mesh);
  });

  const withCenters = meshes.map((m) => {
    const box = new Box3().setFromObject(m);
    const center = new Vector3();
    box.getCenter(center);
    // isBlack: bbox min Y sits above white-key surface (whites ~0, blacks ~13+).
    return { mesh: m, center, isBlack: box.min.y > 10 };
  });

  withCenters.sort((a, b) => a.center.x - b.center.x);

  if (withCenters.length !== MODEL_KEY_COUNT) {
    console.warn(
      `[pianoModelMap] expected ${MODEL_KEY_COUNT} key meshes, found ${withCenters.length}. ` +
        `MIDI mapping may be off.`,
    );
  }

  return withCenters.map((entry, i) => ({
    midi: MODEL_MIDI_LOW + i,
    object: entry.mesh,
    restRotationX: entry.mesh.rotation.x,
    localCenter: entry.center,
    isBlack: entry.isBlack,
  }));
}

export function midiToKeyIndex(midi: number): number | null {
  if (midi < MODEL_MIDI_LOW || midi > MODEL_MIDI_HIGH) return null;
  return midi - MODEL_MIDI_LOW;
}
