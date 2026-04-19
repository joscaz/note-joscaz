/**
 * Decode an uploaded audio File into a Web Audio API AudioBuffer.
 * Uses a transient AudioContext (suspended immediately) so we don't
 * resume audio until the user explicitly plays.
 */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return buffer;
  } finally {
    // Free the decode context; playback uses Tone.js's own context.
    ctx.close().catch(() => undefined);
  }
}

/**
 * Produce a downsampled waveform (mono peaks) from an AudioBuffer for
 * preview drawing. Returns `samples` peak values in [0,1].
 */
export function downsampleWaveform(buffer: AudioBuffer, samples = 512): Float32Array {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / samples));
  const peaks = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let peak = 0;
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
  }
  return peaks;
}
