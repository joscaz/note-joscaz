/**
 * Audio preprocessing: File -> 16 kHz mono `Float32Array`.
 *
 * The ONNX graph's `TorchWavToLogmel` expects exactly the same sample rate
 * and channel layout as training (16 kHz, mono). We do the resample with an
 * `OfflineAudioContext` which is implemented natively in every modern browser
 * and handles arbitrary input rates / channel counts correctly.
 */

export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Decode an audio `File`/`Blob` into a 16 kHz mono `Float32Array`.
 *
 * If the source is already mono and already at 16 kHz we still route through
 * `OfflineAudioContext` — it's cheap and keeps a single code path. We do
 * normalize loudly-clipped files to the [-1, 1] range that the training
 * pipeline assumed (`normalize_wav=True` in `torch_load_resample_audio`).
 */
export async function fileToMono16k(file: Blob): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  // A transient AudioContext just for the initial decode. We can't use
  // OfflineAudioContext here because the source sample rate isn't known yet.
  const decodeCtx = new (window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    // `close()` is supported in every browser we care about but guard anyway.
    if (typeof decodeCtx.close === 'function') {
      await decodeCtx.close().catch(() => undefined);
    }
  }

  return audioBufferToMono16k(decoded);
}

/**
 * Same as `fileToMono16k` but starts from an already-decoded `AudioBuffer`.
 * Useful when the app has already run `decodeAudioData` for playback and we
 * want to avoid decoding twice.
 */
export async function audioBufferToMono16k(
  buffer: AudioBuffer,
): Promise<Float32Array> {
  const durationSec = buffer.duration;
  const targetLen = Math.max(1, Math.ceil(durationSec * TARGET_SAMPLE_RATE));

  const offline = new OfflineAudioContext(
    1, // force mono output
    targetLen,
    TARGET_SAMPLE_RATE,
  );

  const source = offline.createBufferSource();
  source.buffer = buffer;
  // OfflineAudioContext's destination mixes multi-channel sources down to the
  // context's 1 channel, which matches `wave.mean(dim=0)` in training.
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  const channel = rendered.getChannelData(0);

  // Copy so the caller doesn't hold a reference to the AudioBuffer's memory.
  const out = new Float32Array(channel.length);
  out.set(channel);

  normalizeInPlace(out);
  return out;
}

/**
 * Peak-normalize to roughly match `torchaudio.load(..., normalize=True)` which
 * returns float32 in [-1, 1]. We only divide when the file is clipping or
 * has a sub-unity peak so that very quiet recordings are still audible to
 * the model.
 */
function normalizeInPlace(samples: Float32Array): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0 && peak !== 1) {
    const scale = 1 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  }
}
