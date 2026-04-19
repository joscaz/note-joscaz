/**
 * TypeScript port of `OnsetVelocityNmsDecoder` in `ov_piano/inference.py`.
 *
 * The Python decoder:
 *   1. Optionally Gaussian-blurs the onset roll along time.
 *   2. Runs 1-D NMS via max-pool-1d.
 *   3. Thresholds and reads each peak's velocity averaged over ±N frames.
 *
 * We operate on flat `(88, frames)` row-major `Float32Array`s (same layout
 * produced by `chunker.runChunked`). Output is a list of detected note
 * events sorted by time.
 */

import { NUM_KEYS } from './chunker';

export interface NoteEvent {
  /** Frame index within the full rolled-up tensor. */
  tIdx: number;
  /** 0..87 — piano key index, 0 == MIDI 21 (A0). */
  key: number;
  /** 0..1 — smoothed onset probability at the peak. */
  prob: number;
  /** 0..1 — velocity prediction (already sigmoided in the ONNX graph). */
  vel: number;
}

export interface DecodeOptions {
  /** Minimum onset probability. Python default 0.5. */
  probThreshold?: number;
  /** Non-maximum-suppression pool size. Python default 3. */
  nmsPoolSize?: number;
  /**
   * Enable pre-NMS Gaussian blur along time. Matches the piano decoder's
   * `gauss_conv_stddev=1, gauss_conv_ksize=11`. The guitar path in
   * `instruments/guitar/inference.py` does raw peak picking with no blur,
   * so that path passes `blur: false`.
   */
  blur?: boolean;
  /** Std-dev of the Gaussian blur kernel (along time). Python default 1. */
  gaussStd?: number;
  /** Gaussian kernel length. Python default 11 (must be odd). */
  gaussKsize?: number;
  /** Velocity averaging span to the left of the peak. Python default 1. */
  velPadLeft?: number;
  /** Velocity averaging span to the right of the peak. Python default 1. */
  velPadRight?: number;
  /**
   * If `true`, a frame is a peak only when it is strictly greater than its
   * left/right neighbors (ties are rejected). Matches the guitar peak picker.
   * If `false` (default), ties within the NMS window are kept, matching the
   * piano `OnsetVelocityNmsDecoder`.
   */
  strictLocalMax?: boolean;
}

const DEFAULTS: Required<DecodeOptions> = {
  probThreshold: 0.5,
  nmsPoolSize: 3,
  blur: true,
  gaussStd: 1,
  gaussKsize: 11,
  velPadLeft: 1,
  velPadRight: 1,
  strictLocalMax: false,
};

/**
 * Preset tuned to reproduce the piano `OnsetVelocityNmsDecoder` in
 * `instruments/piano/inference.py`.
 */
export const PIANO_DECODE_OPTIONS: DecodeOptions = {
  probThreshold: 0.5,
  nmsPoolSize: 3,
  blur: true,
  gaussStd: 1,
  gaussKsize: 11,
  velPadLeft: 1,
  velPadRight: 1,
};

/**
 * Preset tuned to reproduce the guitar peak picker in
 * `instruments/guitar/inference.py`: no pre-blur, single-frame velocity read,
 * and the same 0.5 onset threshold / strict-local-max NMS behavior.
 */
export const GUITAR_DECODE_OPTIONS: DecodeOptions = {
  probThreshold: 0.5,
  nmsPoolSize: 3,
  blur: false,
  velPadLeft: 0,
  velPadRight: 0,
  strictLocalMax: true,
};

/**
 * Pick onsets from the given probability roll and gather velocities.
 *
 * `onsets` and `velocities` must be flat row-major `(88, frames)`
 * `Float32Array`s.
 */
export function decodeNms(
  onsets: Float32Array,
  velocities: Float32Array,
  frames: number,
  opts: DecodeOptions = {},
): NoteEvent[] {
  const o = { ...DEFAULTS, ...opts };
  if (frames <= 0) return [];

  let smoothed: Float32Array;
  if (o.blur) {
    const kernel = gaussianKernel(o.gaussKsize, o.gaussStd);
    smoothed = blurPerKey(onsets, frames, kernel);
  } else {
    smoothed = onsets;
  }
  const peaks = nmsPerKey(
    smoothed,
    frames,
    o.nmsPoolSize,
    o.probThreshold,
    o.strictLocalMax,
  );

  const events: NoteEvent[] = [];
  for (let key = 0; key < NUM_KEYS; key++) {
    const rowOffset = key * frames;
    for (let t = 0; t < frames; t++) {
      const prob = peaks[rowOffset + t];
      if (prob <= 0) continue;
      const vel = readVelocity(
        velocities,
        frames,
        key,
        t,
        o.velPadLeft,
        o.velPadRight,
      );
      events.push({ tIdx: t, key, prob, vel });
    }
  }

  events.sort((a, b) => a.tIdx - b.tIdx || a.key - b.key);
  return events;
}

/* ------------------------------ primitives -------------------------------- */

function gaussianKernel(ksize: number, std: number): Float32Array {
  if (ksize % 2 === 0) {
    throw new Error(`gaussKsize must be odd, got ${ksize}`);
  }
  const half = (ksize - 1) / 2;
  const out = new Float32Array(ksize);
  let sum = 0;
  for (let i = 0; i < ksize; i++) {
    const x = (i - half) / std;
    const v = Math.exp(-0.5 * x * x);
    out[i] = v;
    sum += v;
  }
  if (sum > 0) {
    for (let i = 0; i < ksize; i++) out[i] /= sum;
  }
  return out;
}

/**
 * Convolve each key's row with the given 1-D kernel. The kernel is symmetric
 * and normalized; we use zero padding at the edges to match torch's default
 * `conv1d` behavior with `padding=half`. (This is what `GaussianBlur1d` does
 * under the hood: a depthwise conv1d with `padding=(ksize-1)//2`.)
 */
function blurPerKey(
  src: Float32Array,
  frames: number,
  kernel: Float32Array,
): Float32Array {
  const ksize = kernel.length;
  const half = (ksize - 1) / 2;
  const out = new Float32Array(src.length);

  for (let key = 0; key < NUM_KEYS; key++) {
    const offset = key * frames;
    for (let t = 0; t < frames; t++) {
      let acc = 0;
      // j is the kernel index; src index is `t + j - half`.
      const minJ = Math.max(0, half - t);
      const maxJ = Math.min(ksize - 1, frames - 1 - t + half);
      for (let j = minJ; j <= maxJ; j++) {
        acc += kernel[j] * src[offset + t + j - half];
      }
      out[offset + t] = acc;
    }
  }
  return out;
}

/**
 * Non-maximum suppression via max-pool-1d followed by keep-if-equal-to-max.
 * Zeros out entries below `threshold`, preserves original values elsewhere.
 *
 * Matches `Nms1d.forward` in `ov_piano/models/building_blocks.py`.
 */
function nmsPerKey(
  src: Float32Array,
  frames: number,
  poolSize: number,
  threshold: number,
  strict: boolean,
): Float32Array {
  const pad = poolSize >> 1; // integer division, matches `pool_ksize // 2`
  const out = new Float32Array(src.length);

  for (let key = 0; key < NUM_KEYS; key++) {
    const offset = key * frames;
    for (let t = 0; t < frames; t++) {
      const v = src[offset + t];
      if (v < threshold) continue;

      const lo = Math.max(0, t - pad);
      const hi = Math.min(frames - 1, t + pad);

      if (strict) {
        // Guitar peak picker: reject ties (`onsets[t±1] >= v` disqualifies).
        // Note: torch's MaxPool1d with `padding>0` pads with -inf for max-pool
        // so out-of-range elements never influence the max — identical to
        // restricting the window to [lo, hi].
        let ok = true;
        for (let s = lo; s <= hi; s++) {
          if (s === t) continue;
          if (src[offset + s] >= v) {
            ok = false;
            break;
          }
        }
        if (ok) out[offset + t] = v;
      } else {
        // Piano `Nms1d.forward`: keep-if-equal-to-max (ties preserved).
        let maxV = -Infinity;
        for (let s = lo; s <= hi; s++) {
          const sv = src[offset + s];
          if (sv > maxV) maxV = sv;
        }
        if (v === maxV) out[offset + t] = v;
      }
    }
  }
  return out;
}

/**
 * Mean velocity over the frames `[t - padLeft, t + padRight]`. Uses reflect
 * padding at the edges, matching `F.pad(velmap, (padLeft, padRight), mode="reflect")`.
 */
function readVelocity(
  velocities: Float32Array,
  frames: number,
  key: number,
  t: number,
  padLeft: number,
  padRight: number,
): number {
  const offset = key * frames;
  const total = padLeft + padRight + 1;
  let acc = 0;
  for (let d = -padLeft; d <= padRight; d++) {
    acc += velocities[offset + reflectIndex(t + d, frames)];
  }
  return acc / total;
}

/** Reflect-pad index into [0, len). Matches torch's `mode='reflect'`. */
function reflectIndex(i: number, len: number): number {
  if (len === 1) return 0;
  const period = 2 * (len - 1);
  let m = i % period;
  if (m < 0) m += period;
  return m >= len ? period - m : m;
}
