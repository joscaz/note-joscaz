import { Object3D, Mesh, BoxGeometry, Vector3 } from 'three';

export const MODEL_MIDI_LOW = 21;   // A0
export const MODEL_MIDI_HIGH = 108; // C8
export const MODEL_KEY_COUNT = MODEL_MIDI_HIGH - MODEL_MIDI_LOW + 1; // 88

export interface PianoKeyRef {
  midi: number;
  object: Object3D;
  restRotationX: number;
  localCenter: Vector3;
  isBlack: boolean;
}

const WHITE_KEY_WIDTH = 0.23;
const WHITE_KEY_LENGTH = 1.50;
const WHITE_KEY_HEIGHT = 0.22;
const GAP = 0.015;

const BLACK_KEY_WIDTH = 0.11;
const BLACK_KEY_LENGTH = 0.95;
const BLACK_KEY_HEIGHT = 0.22;

export const isBlackKey = (midi: number) => {
  const p = midi % 12;
  return p === 1 || p === 3 || p === 6 || p === 8 || p === 10;
};

const getWhiteKeyIndex = (midi: number) => {
  const oct = Math.floor(midi / 12);
  const p = midi % 12;
  const offsets = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
  return oct * 7 + offsets[p] - 12; // -12 so that MIDI 21 (A0) is index 0
};

// Reusable geometries
const whiteGeometry = new BoxGeometry(WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT, WHITE_KEY_LENGTH);
const blackGeometry = new BoxGeometry(BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT, BLACK_KEY_LENGTH);

export function generatePianoKeys(): PianoKeyRef[] {
  const keys: PianoKeyRef[] = [];
  
  for (let midi = MODEL_MIDI_LOW; midi <= MODEL_MIDI_HIGH; midi++) {
    const isBlack = isBlackKey(midi);
    const wIndex = getWhiteKeyIndex(midi);
    
    let x = 0;
    let y = 0;
    let z = 0;
    let geom = null;
    
    if (!isBlack) {
      x = wIndex * (WHITE_KEY_WIDTH + GAP);
      y = WHITE_KEY_HEIGHT / 2;
      z = WHITE_KEY_LENGTH / 2;
      geom = whiteGeometry;
    } else {
      const leftWIndex = getWhiteKeyIndex(midi - 1);
      const rightWIndex = getWhiteKeyIndex(midi + 1);
      const leftX = leftWIndex * (WHITE_KEY_WIDTH + GAP);
      const rightX = rightWIndex * (WHITE_KEY_WIDTH + GAP);
      x = (leftX + rightX) / 2;
      y = WHITE_KEY_HEIGHT + (BLACK_KEY_HEIGHT / 2); 
      z = BLACK_KEY_LENGTH / 2;
      geom = blackGeometry;
    }
    
    const mesh = new Mesh(geom);
    mesh.position.set(x, y, z);
    mesh.updateMatrixWorld();
    
    keys.push({
      midi,
      object: mesh,
      restRotationX: 0,
      localCenter: new Vector3(x, y, z),
      isBlack,
    });
  }
  
  return keys;
}

export function midiToKeyIndex(midi: number): number | null {
  if (midi < MODEL_MIDI_LOW || midi > MODEL_MIDI_HIGH) return null;
  return midi - MODEL_MIDI_LOW;
}
