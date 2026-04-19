/**
 * Strided inference over long audio.
 *
 * The ONNX graph can in principle accept any number of samples, but real
 * recordings can be multiple minutes long and we don't want to pin
 * hundreds of MB of intermediate tensors into wasm heap at once. So we:
 *
 * 1. Chunk the waveform into fixed-size windows with a small overlap.
 * 2. Run the session once per chunk and collect the per-chunk outputs.
 * 3. Splice by dropping half of the overlap from each side — mirroring
 *    `strided_inference` in `ov_piano/inference.py`.
 *
 * Output shape matches a full-length run: `(88, totalFrames)` for both the
 * onset and velocity tensors. The leading batch dim is dropped (it's always
 * 1 for the browser path).
 */

import type { InferenceSession, Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';

import { TARGET_SAMPLE_RATE } from './audioPrep';

export const HOP_SIZE = 384;
export const NUM_KEYS = 88;

// ~20 s of audio per chunk, ~2 s of overlap. Both tuned to be whole multiples
// of `HOP_SIZE`, and the overlap is an even number of frames (matches the
// assertion in the original `strided_inference`).
export const FRAMES_PER_CHUNK = 833; // 833 * 384 / 16000 ≈ 19.99 s
export const OVERLAP_FRAMES = 82; //  82 * 384 / 16000 ≈  1.97 s
const CHUNK_SAMPLES = FRAMES_PER_CHUNK * HOP_SIZE;
const OVERLAP_SAMPLES = OVERLAP_FRAMES * HOP_SIZE;
const STRIDE_SAMPLES = CHUNK_SAMPLES - OVERLAP_SAMPLES;

// Minimum clip length we will run. The model's STFT needs at least one frame;
// anything shorter we pad with silence.
const MIN_SAMPLES = HOP_SIZE * 8;

export interface TranscriptionTensors {
  /** `(88, frames)` flattened row-major: `[key0_frame0, key0_frame1, ...]`. */
  onsets: Float32Array;
  velocities: Float32Array;
  frames: number;
  /** Seconds per frame — `HOP_SIZE / sampleRate`. */
  framePeriodSec: number;
  /** Total audio duration in seconds. */
  durationSec: number;
}

export type ChunkProgressCallback = (progress: number) => void;

/**
 * Run the session over the full waveform, returning the concatenated onset +
 * velocity rolls. The given `onProgress` callback is called with a 0..1
 * value whenever a chunk finishes.
 */
export async function runChunked(
  session: InferenceSession,
  wave: Float32Array,
  onProgress?: ChunkProgressCallback,
): Promise<TranscriptionTensors> {
  const durationSec = wave.length / TARGET_SAMPLE_RATE;
  const framePeriodSec = HOP_SIZE / TARGET_SAMPLE_RATE;

  // If the audio is shorter than one chunk just run it once (with a minimum
  // pad so the STFT has something to work with).
  if (wave.length <= CHUNK_SAMPLES) {
    const padded =
      wave.length < MIN_SAMPLES ? padToLength(wave, MIN_SAMPLES) : wave;
    const { onsets, velocities, frames } = await runSingle(session, padded);
    onProgress?.(1);
    return { onsets, velocities, frames, framePeriodSec, durationSec };
  }

  // --- Strided path --------------------------------------------------------
  const halfOverlap = OVERLAP_FRAMES / 2;

  // Enumerate chunk start indices so we know the total chunk count up front
  // (needed for the progress calculation).
  const starts: number[] = [];
  for (let beg = 0; beg < wave.length; beg += STRIDE_SAMPLES) {
    starts.push(beg);
    if (beg + CHUNK_SAMPLES >= wave.length) break;
  }
  const totalChunks = starts.length;

  const onsetParts: Float32Array[] = [];
  const velocityParts: Float32Array[] = [];
  let totalFrames = 0;

  for (let i = 0; i < totalChunks; i++) {
    const beg = starts[i];
    const rawChunk = wave.subarray(beg, beg + CHUNK_SAMPLES);
    const chunk =
      rawChunk.length < MIN_SAMPLES ? padToLength(rawChunk, MIN_SAMPLES) : rawChunk;

    const {
      onsets: onsetChunk,
      velocities: velChunk,
      frames: chunkFrames,
    } = await runSingle(session, chunk);

    const isFirst = i === 0;
    const isLast = i === totalChunks - 1;
    const startFrame = isFirst ? 0 : halfOverlap;
    const endFrame = isLast ? chunkFrames : chunkFrames - halfOverlap;
    const keepFrames = Math.max(0, endFrame - startFrame);

    if (keepFrames > 0) {
      onsetParts.push(
        slicePerKey(onsetChunk, chunkFrames, startFrame, keepFrames),
      );
      velocityParts.push(
        slicePerKey(velChunk, chunkFrames, startFrame, keepFrames),
      );
      totalFrames += keepFrames;
    }

    onProgress?.((i + 1) / totalChunks);
    // Yield to the event loop so the UI stays responsive between chunks.
    await nextTick();
  }

  const onsets = concatPerKey(onsetParts, totalFrames);
  const velocities = concatPerKey(velocityParts, totalFrames);
  return { onsets, velocities, frames: totalFrames, framePeriodSec, durationSec };
}

/* -------------------------------------------------------------------------- */

async function runSingle(
  session: InferenceSession,
  wave: Float32Array,
): Promise<{ onsets: Float32Array; velocities: Float32Array; frames: number }> {
  const tensor = new ort.Tensor('float32', wave, [wave.length]);
  const feeds: Record<string, Tensor> = { wave: tensor };
  const out = await session.run(feeds);

  const onsetT = out.onsets ?? out[Object.keys(out)[0]];
  const velT = out.velocities ?? out[Object.keys(out)[1]];

  // Expected shapes: (1, 88, frames).
  if (onsetT.dims.length !== 3 || onsetT.dims[1] !== NUM_KEYS) {
    throw new Error(
      `unexpected onsets shape ${JSON.stringify(onsetT.dims)}; ` +
        `expected [1, 88, frames]`,
    );
  }
  const frames = onsetT.dims[2];

  return {
    onsets: toFloat32(onsetT.data),
    velocities: toFloat32(velT.data),
    frames,
  };
}

/**
 * Slice `[frameStart, frameStart + frameCount)` out of a `(88, totalFrames)`
 * row-major tensor, producing a new `(88, frameCount)` row-major buffer.
 */
function slicePerKey(
  tensor: Float32Array,
  totalFrames: number,
  frameStart: number,
  frameCount: number,
): Float32Array {
  const out = new Float32Array(NUM_KEYS * frameCount);
  for (let k = 0; k < NUM_KEYS; k++) {
    const srcOffset = k * totalFrames + frameStart;
    const dstOffset = k * frameCount;
    out.set(tensor.subarray(srcOffset, srcOffset + frameCount), dstOffset);
  }
  return out;
}

/**
 * Concatenate a list of `(88, frames_i)` row-major slices along the time
 * axis, producing a `(88, totalFrames)` row-major buffer.
 */
function concatPerKey(
  parts: Float32Array[],
  totalFrames: number,
): Float32Array {
  const out = new Float32Array(NUM_KEYS * totalFrames);
  for (let k = 0; k < NUM_KEYS; k++) {
    let framesWritten = 0;
    for (const part of parts) {
      const partFrames = part.length / NUM_KEYS;
      const srcOffset = k * partFrames;
      const dstOffset = k * totalFrames + framesWritten;
      out.set(part.subarray(srcOffset, srcOffset + partFrames), dstOffset);
      framesWritten += partFrames;
    }
  }
  return out;
}

function padToLength(src: Float32Array, length: number): Float32Array {
  if (src.length >= length) return src;
  const out = new Float32Array(length);
  out.set(src);
  return out;
}

function toFloat32(data: Tensor['data']): Float32Array {
  if (data instanceof Float32Array) return data;
  // ORT may hand us a SharedArrayBuffer-backed typed array in some configs;
  // copy to a plain Float32Array so the rest of the pipeline is unambiguous.
  const arr = data as ArrayLike<number>;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i];
  return out;
}

function nextTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
