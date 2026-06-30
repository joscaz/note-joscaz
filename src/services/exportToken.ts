import { create } from 'zustand';
import type { MidiSource } from '../types/midiSource';

/**
 * Holds the current short-lived MP4-export provenance token (design §3,
 * Layer 2 — server-issued, server-verified; this store is just a mailbox).
 *
 * The token is minted ONLY by the backend:
 *   - on a successful /transcribe call (returned via the `X-Export-Token`
 *     response header, read by transcriptionService.ts);
 *   - on a successful POST /export/midi-token call after a user uploads
 *     their own .mid file (see mintMidiUploadToken below).
 * Curated/demo loads NEVER mint a token and MUST clear any stale one — a
 * token left over from a previous exportable piece must not silently ride
 * along into a non-exportable session and let /export/mp4 succeed for the
 * wrong source.
 *
 * `source` here is purely a local UX echo of the token's `src` claim (so the
 * UI can say "this token is for transcribed/user-midi audio"); it carries NO
 * authority — only the server's independent verify_export_token check does.
 */
export interface ExportTokenState {
  token: string | null;
  source: MidiSource | null;
  /** Unix seconds (matches the JWT `exp` claim) — used only for client-side
   * "is this obviously stale" UX hints; the server is the real authority. */
  exp: number | null;
  setToken: (token: string, source: MidiSource, exp: number) => void;
  clearToken: () => void;
}

export const useExportTokenStore = create<ExportTokenState>((set) => ({
  token: null,
  source: null,
  exp: null,
  setToken: (token, source, exp) => set({ token, source, exp }),
  clearToken: () => set({ token: null, source: null, exp: null }),
}));

/** Non-hook accessor for the current token — used by exportService, which
 * runs outside React component bodies. */
export function getExportToken(): string | null {
  return useExportTokenStore.getState().token;
}

/** True when a token exists and hasn't passed its own `exp` claim locally.
 * A false positive here (token "looks fresh" but the server disagrees) is
 * fine — the server re-verifies independently and is the only real gate. */
export function hasFreshExportToken(): boolean {
  const { token, exp } = useExportTokenStore.getState();
  if (!token) return false;
  if (exp == null) return true;
  return exp * 1000 > Date.now();
}
