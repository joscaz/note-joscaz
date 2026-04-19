/**
 * Music theory helpers for an 88-key piano (MIDI 21 = A0 through MIDI 108 = C8).
 * Provides:
 *  - Note name helpers.
 *  - Black/white key predicate.
 *  - Pre-computed per-key x/width lookup on an arbitrary canvas width so both
 *    the PianoRoll and PianoKeyboard canvases share the exact same x-axis.
 */

export const MIDI_LOW = 21;   // A0
export const MIDI_HIGH = 108; // C8
export const NUM_KEYS = MIDI_HIGH - MIDI_LOW + 1; // 88
export const WHITE_KEY_COUNT = 52;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export function isCKey(midi: number): boolean {
  return ((midi % 12) + 12) % 12 === 0;
}

/** Zero-based index of the white key, or -1 for black keys. A0 = 0. */
function whiteKeyIndex(midi: number): number {
  if (isBlackKey(midi)) return -1;
  let idx = 0;
  for (let m = MIDI_LOW; m < midi; m++) {
    if (!isBlackKey(m)) idx++;
  }
  return idx;
}

export interface KeyRect {
  midi: number;
  x: number;
  width: number;
  isBlack: boolean;
}

/**
 * Build an 88-entry table mapping each midi number (21..108) to {x,width}
 * positioned across `canvasWidth`. White keys are evenly spaced; black keys
 * sit on top of the gap between two white keys with width = 0.58 * whiteWidth.
 */
export function buildKeyLayout(canvasWidth: number): KeyRect[] {
  const whiteWidth = canvasWidth / WHITE_KEY_COUNT;
  const blackWidth = whiteWidth * 0.58;

  // First pass: collect white key x positions.
  const layout: KeyRect[] = [];
  let whiteIdx = 0;
  for (let midi = MIDI_LOW; midi <= MIDI_HIGH; midi++) {
    if (!isBlackKey(midi)) {
      layout.push({
        midi,
        x: whiteIdx * whiteWidth,
        width: whiteWidth,
        isBlack: false,
      });
      whiteIdx++;
    } else {
      layout.push({ midi, x: 0, width: 0, isBlack: true });
    }
  }

  // Second pass: position black keys between their neighbouring white keys.
  for (let i = 0; i < layout.length; i++) {
    const rect = layout[i];
    if (!rect.isBlack) continue;
    // Find the previous white key.
    let prev = i - 1;
    while (prev >= 0 && layout[prev].isBlack) prev--;
    const prevWhite = layout[prev];
    const centerX = prevWhite.x + prevWhite.width;
    rect.x = centerX - blackWidth / 2;
    rect.width = blackWidth;
  }

  return layout;
}

export function midiToKeyRect(midi: number, layout: KeyRect[]): KeyRect | undefined {
  if (midi < MIDI_LOW || midi > MIDI_HIGH) return undefined;
  return layout[midi - MIDI_LOW];
}

// Exported for debug / display purposes.
export { whiteKeyIndex };
