import type { Midi } from '@tonejs/midi';

/** Trigger a browser download of the given Midi object as a .mid file. */
export function downloadMidi(midi: Midi, filename = 'notejoscaz.mid'): void {
  const bytes = midi.toArray();
  // Copy into a fresh ArrayBuffer-backed Uint8Array so TS's Blob typings are happy.
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
