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
 * Build a layout table mapping each midi number in [low..high] to {x,width}
 * positioned across `canvasWidth`. When `range` is omitted the full 88-key
 * span (MIDI 21–108) is used. White keys are evenly spaced; black keys sit
 * on top of the gap between two white keys with width = 0.58 * whiteWidth.
 */
export function buildKeyLayout(
  canvasWidth: number,
  range?: { low: number; high: number },
): KeyRect[] {
  const low = range?.low ?? MIDI_LOW;
  const high = range?.high ?? MIDI_HIGH;

  let whiteCount = 0;
  for (let m = low; m <= high; m++) {
    if (!isBlackKey(m)) whiteCount++;
  }

  const whiteWidth = canvasWidth / (whiteCount || 1);
  const blackWidth = whiteWidth * 0.58;

  const layout: KeyRect[] = [];
  let whiteIdx = 0;
  for (let midi = low; midi <= high; midi++) {
    if (!isBlackKey(midi)) {
      layout.push({ midi, x: whiteIdx * whiteWidth, width: whiteWidth, isBlack: false });
      whiteIdx++;
    } else {
      layout.push({ midi, x: 0, width: 0, isBlack: true });
    }
  }

  for (let i = 0; i < layout.length; i++) {
    const rect = layout[i];
    if (!rect.isBlack) continue;
    let prev = i - 1;
    while (prev >= 0 && layout[prev].isBlack) prev--;
    const prevWhite = layout[prev];
    const centerX = prevWhite.x + prevWhite.width;
    rect.x = centerX - blackWidth / 2;
    rect.width = blackWidth;
  }

  return layout;
}

export function midiToKeyRect(
  midi: number,
  layout: KeyRect[],
  rangeLow = MIDI_LOW,
): KeyRect | undefined {
  const idx = midi - rangeLow;
  if (idx < 0 || idx >= layout.length) return undefined;
  return layout[idx];
}

// Exported for debug / display purposes.
export { whiteKeyIndex };
