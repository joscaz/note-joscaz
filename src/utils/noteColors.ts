export type InstrumentType = 'piano' | 'guitar';

export interface NoteGradient {
  top: string;
  bottom: string;
  glow: string;
  accent: string;
}

export const NOTE_GRADIENTS: Record<InstrumentType, NoteGradient> = {
  piano: {
    top: '#00f5a0',
    bottom: '#00b4d8',
    glow: 'rgba(0, 245, 160, 0.7)',
    accent: '#ffffff',
  },
  guitar: {
    top: '#7b2fff',
    bottom: '#ff2d6b',
    glow: 'rgba(123, 47, 255, 0.7)',
    accent: '#ffffff',
  },
};

/**
 * Velocity (0..1) → opacity. Soft notes stay visible (0.4 floor),
 * loud notes fully opaque.
 */
export function velocityToOpacity(velocity: number): number {
  const v = Math.max(0, Math.min(1, velocity));
  return 0.4 + v * 0.6;
}

/** Slightly shift hue based on pitch (gives the roll visual variety). */
export function pitchTint(midi: number, base: string): string {
  // base is a hex like #00f5a0. Parse, shift by a small amount based on midi.
  const hex = base.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const shift = (midi - 60) * 0.6;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${clamp(r + shift)}, ${clamp(g - shift * 0.5)}, ${clamp(b - shift * 0.3)})`;
}
