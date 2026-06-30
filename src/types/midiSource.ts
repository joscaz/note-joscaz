/**
 * Single source of truth for the provenance of the currently active MIDI.
 *
 * Each load path in PlayerPage sets this EXACTLY ONCE:
 *   transcribe success -> Transcribed
 *   user MIDI upload    -> UserMidi
 *   curated select      -> Curated
 *   demo preload        -> Demo
 *
 * This is the CLIENT-side export gate — it hides/disables the Export
 * affordance for non-exportable sources. Export now runs fully client-side
 * (WebCodecs), so this is the ONLY enforcement layer; there is no server-side
 * revalidation. A determined user could bypass it, which is an accepted
 * tradeoff for this client-only pipeline.
 *
 * Fail-closed: any value outside the known set (including null/undefined)
 * resolves to NOT exportable / NOT downloadable.
 */
export const MidiSource = {
  Transcribed: 'transcribed',
  UserMidi: 'user-midi',
  Curated: 'curated',
  Demo: 'demo',
} as const;

export type MidiSource = (typeof MidiSource)[keyof typeof MidiSource];

const EXPORTABLE = new Set<MidiSource>([MidiSource.Transcribed, MidiSource.UserMidi]);

/**
 * Fail-closed: null/undefined/unknown -> false. Curated and demo are
 * deliberately excluded — only transcribed and user-uploaded MIDI may be
 * exported as MP4.
 */
export function isExportable(source?: MidiSource | null): boolean {
  return source != null && EXPORTABLE.has(source);
}

/**
 * Mirrors isExportable today (transcribed/user-midi downloadable, curated/demo
 * not) — kept as a distinct named export so the MIDI-download gate and the
 * MP4-export gate can diverge independently later without re-deriving from
 * booleans.
 */
export function isMidiDownloadable(source?: MidiSource | null): boolean {
  return isExportable(source);
}
