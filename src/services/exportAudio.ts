import * as Tone from 'tone';
import {
  PIANO_RELEASE_SEC,
  GUITAR_RELEASE_SEC,
  MASTER_VOLUME_DB,
  GUITAR_LIMITER_THRESHOLD_DB,
} from './audioEngine';
import type { NoteEvent } from './audioEngine';
import type { InstrumentType } from '../utils/noteColors';

/**
 * Synth-only offline audio render for MP4 export (design §5, REV 2 decision
 * 2). Even when the live A/B source is 'mp3' or 'both', the export ALWAYS
 * renders the synth (Tone.Offline) path only — the original MP3 is never
 * blended into the export. This sidesteps an offline Tone.Player/mp3-buffer
 * path entirely and keeps the render a pure function of the scheduled notes
 * (no Date.now/Math.random anywhere in this module), so re-running the same
 * notes always produces byte-identical audio and stays in lockstep with the
 * deterministic frame capture in exportRenderer.ts at mux time.
 *
 * Empirically validated by Spike 0 (one-off browser run, rms=0.045645 >
 * epsilon 0.001; the disposable spike harness has since been removed). This
 * module mirrors that validated pattern: a brand-new Sampler is constructed bound
 * to the OFFLINE context via the `{ context }` option (Tone.Sampler accepts
 * this), `Tone.loaded()` is awaited (sample fetch+decode is global/static,
 * NOT context-bound, so awaiting it works correctly even from inside the
 * Tone.Offline callback), notes are scheduled onto the offline context's own
 * `transport`, then `transport.start(0)`.
 *
 * Sampler configs (urls/baseUrl/release) are copy-identical to
 * src/services/audioEngine.ts's loadInstruments() — same CDN sample sets,
 * same release tails (PIANO_RELEASE_SEC/GUITAR_RELEASE_SEC, imported from
 * audioEngine.ts so both stay in lockstep) — so the export audio timbre
 * matches live playback exactly. The signal chain is also replicated
 * node-for-node: sampler -> [Limiter(-3) for guitar only] -> synthGain
 * (gain=1, neutral, included for structural parity) -> masterVolume
 * (Tone.Volume(-4), same -4dB as audioEngine's `masterVolume`) ->
 * destination. Without the -4dB Volume node, exported audio would render
 * ~4dB louder than what the user actually heard live.
 *
 * Scheduling mirrors audioEngine.loadMidi()'s synth trigger logic exactly,
 * including the `pianoSustain` toggle: when on, piano uses pure
 * triggerAttack (model-truthful onset-only, natural sample decay — the
 * Onsets & Velocities model has no note-off); when off (or for guitar
 * always), triggerAttackRelease with Math.max(0.02, n.duration) — the same
 * call audioEngine makes, since the cosmetic ≤0.30s clamp for piano is
 * already baked into `n.duration` upstream by clampPianoDurations
 * (transcriptionService.ts), not reapplied here. `pianoSustain` defaults to
 * true (sustain on / natural decay) but WU4 will pass the live
 * `audioEngine.pianoSustain` value through so the export is WYSIWYG with
 * whatever the user last toggled before exporting.
 */

export interface ExportAudioOptions {
  notes: readonly NoteEvent[];
  instrument: InstrumentType;
  /** MIDI-derived audible duration in seconds (audioEngine.duration). Must
   * match the duration used to compute the exported frame count so audio
   * and video stay the same length at mux time. */
  durationSec: number;
  /** Output sample rate. Backend `meta.audioSampleRate` must match this. */
  sampleRate?: number;
  /** Output channel count. Tone.Offline's `channels` argument. */
  numChannels?: number;
  /** Piano-only. Mirrors the live `audioEngine.pianoSustain` toggle so the
   * export is WYSIWYG: true (default) = natural Salamander decay via
   * triggerAttack; false = clamped triggerAttackRelease, matching exactly
   * what the user heard live with sustain off. Ignored for guitar, which
   * always uses triggerAttackRelease regardless of this flag (same as
   * audioEngine.loadMidi). WU4 will pass `audioEngine.pianoSustain` here. */
  pianoSustain?: boolean;
  /** Called once the offline render starts, and once it finishes. Tone.Offline
   * has no per-sample/per-step progress hook, so this is necessarily coarse —
   * mirrors exportRenderer's onProgress shape for WU4's combined progress UI. */
  onProgress?: (renderedSteps: number, totalSteps: number) => void;
  /** Abort before starting or immediately after finishing the render (checked
   * at both points — Tone.Offline itself has no native cancellation, so an
   * abort mid-render cannot stop the underlying OfflineAudioContext, only
   * prevent its result from being used). */
  signal?: AbortSignal;
}

export interface ExportAudioResult {
  wavBlob: Blob;
  sampleRate: number;
  durationSec: number;
  numChannels: number;
}

const DEFAULT_SAMPLE_RATE = 44_100;
const DEFAULT_NUM_CHANNELS = 2;

const PIANO_SAMPLER_URLS: Record<string, string> = {
  A1: 'A1.mp3',
  A2: 'A2.mp3',
  A3: 'A3.mp3',
  A4: 'A4.mp3',
  A5: 'A5.mp3',
  A6: 'A6.mp3',
  C2: 'C2.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  C6: 'C6.mp3',
  C7: 'C7.mp3',
};
const PIANO_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

const GUITAR_SAMPLER_URLS: Record<string, string> = {
  E2: 'E2.mp3',
  A2: 'A2.mp3',
  D3: 'D3.mp3',
  G3: 'G3.mp3',
  C4: 'C4.mp3',
  E4: 'E4.mp3',
  A4: 'A4.mp3',
};
const GUITAR_BASE_URL = 'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/';

// MASTER_VOLUME_DB (-4dB master attenuation) and GUITAR_LIMITER_THRESHOLD_DB
// (-3dB guitar limiter) are imported from audioEngine.ts — the single source
// of truth for the live signal chain — so export loudness/limiting can never
// silently drift from live. The limiter sits BEFORE the master Volume, same
// position as live. Without the -4dB Volume the export would render ~4dB hotter
// than what the user actually heard.

/** Nodes created per-render so they can be disposed in a `finally` block
 * once Tone.Offline resolves (or throws/aborts), consistent with
 * audioEngine.dispose()'s explicit cleanup pattern. */
interface OfflineChain {
  sampler: Tone.Sampler;
  limiter?: Tone.Limiter;
  synthGain: Tone.Gain;
  masterVolume: Tone.Volume;
}

/**
 * Builds the offline sampler + signal chain, replicating audioEngine's live
 * chain node-for-node and in the same order:
 *   piano:  sampler -> synthGain(1) -> masterVolume(-4dB) -> destination
 *   guitar: sampler -> Limiter(-3) -> synthGain(1) -> masterVolume(-4dB) -> destination
 * synthGain at gain=1 is neutral (a no-op multiplier) but is included for
 * exact structural parity with the live chain.
 */
function buildOfflineChain(
  ctx: Tone.OfflineContext,
  instrument: InstrumentType,
): OfflineChain {
  const masterVolume = new Tone.Volume({ context: ctx, volume: MASTER_VOLUME_DB }).toDestination();
  const synthGain = new Tone.Gain({ context: ctx, gain: 1 }).connect(masterVolume);

  if (instrument === 'piano') {
    const sampler = new Tone.Sampler({
      context: ctx,
      urls: PIANO_SAMPLER_URLS,
      release: PIANO_RELEASE_SEC,
      baseUrl: PIANO_BASE_URL,
    }).connect(synthGain);
    return { sampler, synthGain, masterVolume };
  }

  // Guitar runs through a Limiter in audioEngine (to tame pitch-shift
  // overshoot); mirrored here, same position (before synthGain/masterVolume)
  // so limiting behavior matches live exactly.
  const limiter = new Tone.Limiter({ context: ctx, threshold: GUITAR_LIMITER_THRESHOLD_DB }).connect(synthGain);
  const sampler = new Tone.Sampler({
    context: ctx,
    urls: GUITAR_SAMPLER_URLS,
    release: GUITAR_RELEASE_SEC,
    baseUrl: GUITAR_BASE_URL,
  }).connect(limiter);
  return { sampler, limiter, synthGain, masterVolume };
}

/**
 * Schedules every note from `notes` onto the given offline transport, using
 * the SAME trigger logic as audioEngine.loadMidi(): piano with sustain ON =
 * pure triggerAttack (onset-only, natural decay); piano with sustain OFF, or
 * guitar always, = triggerAttackRelease with Math.max(0.02, n.duration) —
 * the cosmetic ≤0.30s clamp for piano is already baked into `n.duration`
 * upstream (clampPianoDurations), so this is the exact same call audioEngine
 * makes, not a separate re-clamp.
 */
function scheduleNotesOnto(
  transport: Tone.OfflineContext['transport'],
  notes: readonly NoteEvent[],
  instrument: InstrumentType,
  pianoSustain: boolean,
  sampler: Tone.Sampler,
): void {
  const isPiano = instrument === 'piano';
  for (const n of notes) {
    transport.schedule((time) => {
      try {
        const note = Tone.Frequency(n.midi, 'midi').toNote();
        if (isPiano && pianoSustain) {
          sampler.triggerAttack(note, time, n.velocity);
        } else {
          sampler.triggerAttackRelease(note, Math.max(0.02, n.duration), time, n.velocity);
        }
      } catch {
        // Mirrors audioEngine's defensive catch — a sampler asked to play
        // before its samples are attached should not abort the whole render.
      }
    }, n.time);
  }
}

/**
 * Renders the SYNTH-ONLY export audio via Tone.Offline and encodes the
 * result as a 16-bit PCM WAV Blob (the backend's `audio` multipart field —
 * see design §6/§8 and the cross-repo contract: POST /export/mp4 expects a
 * WAV file plus `meta.audioSampleRate`/`meta.durationSec`).
 */
export async function renderExportAudio(options: ExportAudioOptions): Promise<ExportAudioResult> {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const numChannels = options.numChannels ?? DEFAULT_NUM_CHANNELS;
  const pianoSustain = options.pianoSustain ?? true;

  if (options.signal?.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  options.onProgress?.(0, 1);

  // Created inside the Tone.Offline callback (chain is bound to `ctx`),
  // captured here so the finally block below can dispose it regardless of
  // how the render settles (success, throw, or abort).
  let chain: OfflineChain | undefined;

  try {
    const buffer = await Tone.Offline(async (ctx) => {
      chain = buildOfflineChain(ctx, options.instrument);

      // Sample fetch+decode is global/static (ToneAudioBuffer.downloads), not
      // context-bound — awaiting Tone.loaded() here is correct even though
      // we're inside the Tone.Offline callback (verified by Spike 0).
      await Tone.loaded();

      scheduleNotesOnto(ctx.transport, options.notes, options.instrument, pianoSustain, chain.sampler);
      ctx.transport.start(0);
    }, options.durationSec, numChannels, sampleRate);

    if (options.signal?.aborted) {
      throw new DOMException('Export aborted', 'AbortError');
    }

    const wavBlob = audioBufferToWavBlob(buffer.get() as AudioBuffer, numChannels);

    options.onProgress?.(1, 1);

    return {
      wavBlob,
      sampleRate,
      durationSec: options.durationSec,
      numChannels,
    };
  } finally {
    // Dispose the offline nodes regardless of success/throw/abort, mirroring
    // audioEngine.dispose()'s explicit cleanup pattern. OfflineContext is
    // discarded per-call (GC would reclaim it eventually either way), but
    // explicit disposal avoids relying on GC timing for sample-buffer-backed
    // nodes and matches the codebase's established convention.
    chain?.sampler.dispose();
    chain?.limiter?.dispose();
    chain?.synthGain.dispose();
    chain?.masterVolume.dispose();
  }
}

/**
 * Dependency-free 16-bit PCM WAV encoder. AudioBuffer/ToneAudioBuffer are
 * context-agnostic (Spike 0 verified fact) so this takes a plain AudioBuffer
 * and writes a minimal, correct RIFF/WAVE file: 44-byte header (RIFF chunk,
 * fmt sub-chunk for PCM, data sub-chunk) followed by interleaved, clamped
 * 16-bit little-endian samples. No npm dependency — deliberately small and
 * fully deterministic (pure function of the input buffer).
 */
function audioBufferToWavBlob(buffer: AudioBuffer, numChannels: number): Blob {
  const channels = Math.min(numChannels, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true); // audio format = 1 (PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels, clamp to [-1, 1], convert to 16-bit signed PCM.
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][i]));
      const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
