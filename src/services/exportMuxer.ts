/**
 * exportMuxer.ts — Client-side MP4 encode + mux via WebCodecs (H.264 video)
 * and mediabunny's AudioSampleSource (AAC audio, with WASM polyfill).
 *
 * Design note on audio encoding:
 *   The design artifact proposed using a raw WebCodecs `AudioEncoder` for
 *   AAC, but Chrome/Chromium does not support native AAC encoding via
 *   WebCodecs. `@mediabunny/aac-encoder` is a mediabunny CustomAudioEncoder
 *   (not a WebCodecs polyfill), so it only works through mediabunny's own
 *   `AudioSampleSource`. We use AudioSampleSource here, which handles the
 *   encode lifecycle internally and uses the registered WASM encoder when
 *   native AAC is unavailable.
 *
 * Lifecycle:
 *   createExportMuxer(config) → ExportMuxer
 *     muxer.addVideoFrame(canvas, tMicros, keyFrame) → Promise<void>
 *     muxer.addAudioChunk(data: AudioData) → void
 *   muxer.finalize() → Promise<ArrayBuffer>
 *   muxer.dispose()  (idempotent; safe after finalize or on abort)
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  AudioSampleSource,
  AudioSample,
  EncodedPacket,
  canEncodeAudio,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';

// ---------------------------------------------------------------------------
// Browser-support gate
// ---------------------------------------------------------------------------

/**
 * Returns true when the browser exposes the WebCodecs primitives required for
 * client-side video encoding. Used as an early gate before probing codecs.
 */
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
}

// ---------------------------------------------------------------------------
// Codec negotiation
// ---------------------------------------------------------------------------

/**
 * H.264 profile/level candidates. resolveH264Codec probes these in order and
 * returns the first the browser accepts for the requested width/height/fps.
 *
 * L4.2 is listed first because it covers everything up to ~1080p64 and is the
 * most broadly hardware-accelerated tier. The L5.2 entries are the high
 * frame-rate fallback: a 1080p120 export (the HIGH preset) exceeds L4.2's
 * macroblock-rate ceiling, so isConfigSupported rejects the L4.2 strings for
 * it and selection falls through to L5.2. Low/medium exports still land on
 * L4.2 because it is probed first and accepts their config.
 */
const H264_CANDIDATES = [
  'avc1.42002a', // Baseline L4.2 — covers up to ~1080p64
  'avc1.4d002a', // Main      L4.2
  'avc1.640034', // High      L5.2 — 1080p120 high frame-rate fallback
  'avc1.4d0034', // Main      L5.2
  'avc1.42001e', // Baseline  L3.0 — fallback for low/medium
  'avc1.4d001e', // Main      L3.0
] as const;

/**
 * Probes `VideoEncoder.isConfigSupported` for each H.264 candidate string in
 * order and returns the first codec string the browser accepts, or `null` if
 * none pass (or if the browser has no WebCodecs support at all).
 */
export async function resolveH264Codec(opts: {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}): Promise<string | null> {
  if (!isWebCodecsSupported()) return null;
  for (const codec of H264_CANDIDATES) {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec,
      width: opts.width,
      height: opts.height,
      bitrate: opts.bitrate,
      framerate: opts.fps,
    });
    if (supported) return codec;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportMuxerConfig {
  width: number;
  height: number;
  fps: number;
  /** H.264 codec string — must be resolved by resolveH264Codec first. */
  videoCodec: string;
  /** Video bitrate in bits-per-second. */
  videoBitrate: number;
  /**
   * Informational only — actual value inferred from the first audio chunk.
   * AudioSampleSource reads sampleRate/numberOfChannels from the first
   * AudioSample added, so the muxer does not need them at construction time.
   */
  audioSampleRate: number;
  /** Informational only — see audioSampleRate note above. */
  audioChannels: number;
  /** Audio bitrate in bits-per-second. */
  audioBitrate: number;
}

export interface ExportMuxer {
  /**
   * Wraps `canvas` in a `VideoFrame` at `tMicros`, encodes it, and closes
   * the frame. Applies backpressure (awaits a one-shot `dequeue` event) when
   * the encoder's in-flight queue exceeds 8 frames.
   */
  addVideoFrame(
    canvas: HTMLCanvasElement,
    tMicros: number,
    keyFrame: boolean,
  ): Promise<void>;

  /**
   * Eagerly copies `data` into a new AudioSample buffer, schedules AAC
   * encoding, then closes `data`. The caller can safely close `data`
   * immediately — it is always consumed before this call returns.
   */
  addAudioChunk(data: AudioData): void;

  /**
   * Flushes the video encoder, waits for all pending mux operations, and
   * calls `output.finalize()` (which also flushes the audio encoder's
   * remaining buffered frames). Returns the complete MP4 `ArrayBuffer`.
   */
  finalize(): Promise<ArrayBuffer>;

  /**
   * Releases all resources. Idempotent — safe to call after finalize or on
   * export abort/cancel. Cancels the mediabunny Output if still live.
   */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Maximum in-flight video frames before we apply backpressure. */
const MAX_VIDEO_QUEUE = 8;

/**
 * Creates and starts an ExportMuxer for the given configuration.
 * Must be called after `resolveH264Codec` has provided a valid `videoCodec`.
 */
export async function createExportMuxer(
  config: ExportMuxerConfig,
): Promise<ExportMuxer> {
  const {
    width,
    height,
    fps,
    videoCodec,
    videoBitrate,
    audioSampleRate: _audioSampleRate,
    audioChannels: _audioChannels,
    audioBitrate,
  } = config;

  // 1. Muxer output — MP4 container written to an in-memory BufferTarget.
  const bufferTarget = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target: bufferTarget });

  // 2. Video track — receives EncodedPackets produced by the WebCodecs encoder.
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource);

  // 3. AAC polyfill registration.
  //    `canEncodeAudio` uses mediabunny's detection; `registerAacEncoder`
  //    installs the WASM-backed CustomAudioEncoder into mediabunny's registry.
  //    Must be called before the first AudioSampleSource.add() so the lazy
  //    encoder initialisation picks it up.
  if (!(await canEncodeAudio('aac'))) {
    registerAacEncoder();
  }

  // 4. Audio track — AudioSampleSource handles encoding internally via the
  //    registered AAC encoder. sampleRate / numberOfChannels are inferred
  //    from the first AudioSample added, so they are not needed here.
  const audioSource = new AudioSampleSource({ codec: 'aac', bitrate: audioBitrate });
  output.addAudioTrack(audioSource);

  // 5. WebCodecs VideoEncoder — outputs EncodedVideoChunks that are bridged
  //    into videoSource via EncodedPacket.fromEncodedChunk.
  const pendingVideo: Promise<void>[] = [];
  const pendingAudio: Promise<void>[] = [];
  let firstVideoChunk = true;
  let disposed = false;
  // Captured out-of-band by the VideoEncoder error callback; re-thrown at the
  // top of finalize() so callers see the original DOMException, not a generic
  // InvalidStateError from a subsequent flush on a broken encoder.
  let videoEncoderError: DOMException | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      // Only consume the first-chunk slot when decoderConfig is actually
      // present. If the first chunk is a delta frame (encoder hasn't emitted
      // a keyframe yet), we must NOT mark the slot as consumed — otherwise the
      // real keyframe's decoderConfig never reaches mediabunny and the MP4
      // will be missing its SPS/PPS, making it undecodable.
      const chunkMeta = (firstVideoChunk && meta?.decoderConfig) ? meta : undefined;
      if (chunkMeta) firstVideoChunk = false;
      pendingVideo.push(videoSource.add(packet, chunkMeta) as Promise<void>);
    },
    error: (e: DOMException) => {
      videoEncoderError = e;
      console.error('[exportMuxer] VideoEncoder error:', e);
    },
  });

  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: videoBitrate,
    framerate: fps,
  });

  // 6. Start the mediabunny Output after all tracks are registered.
  //    If start() rejects, close the already-configured VideoEncoder so it
  //    doesn't leak — the caller never receives an ExportMuxer ref to call
  //    dispose() on the partial init.
  try {
    await output.start();
  } catch (err) {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Return the ExportMuxer implementation.
  // ---------------------------------------------------------------------------
  return {
    async addVideoFrame(
      canvas: HTMLCanvasElement,
      tMicros: number,
      keyFrame: boolean,
    ): Promise<void> {
      const frame = new VideoFrame(canvas, { timestamp: tMicros });
      videoEncoder.encode(frame, { keyFrame });
      frame.close();
      if (videoEncoder.encodeQueueSize > MAX_VIDEO_QUEUE) {
        await new Promise<void>((r) =>
          videoEncoder.addEventListener('dequeue', () => r(), { once: true }),
        );
      }
    },

    addAudioChunk(data: AudioData): void {
      // Eagerly copy all channel planes into a Float32Array that the
      // AudioSample owns, so the caller can close `data` immediately without
      // invalidating the backing buffer before encoding completes.
      const nFrames = data.numberOfFrames;
      const nChannels = data.numberOfChannels;
      const sampleRate = data.sampleRate;
      const timestampSeconds = data.timestamp / 1_000_000; // µs → s

      // f32-planar layout: [ch0_frame0…ch0_frameN, ch1_frame0…ch1_frameN, …]
      const buf = new Float32Array(nFrames * nChannels);
      for (let ch = 0; ch < nChannels; ch++) {
        data.copyTo(buf.subarray(ch * nFrames, (ch + 1) * nFrames), {
          planeIndex: ch,
          format: 'f32-planar',
        });
      }

      const sample = new AudioSample({
        data: buf,
        format: 'f32-planar',
        numberOfChannels: nChannels,
        sampleRate,
        timestamp: timestampSeconds,
      });

      // Collect the Promise so finalize() can await all in-flight encodes.
      // `.finally` closes the AudioSample after encoding completes; mediabunny
      // calls add() with shouldClose=false, so without this the sample leaks.
      pendingAudio.push(
        (audioSource.add(sample) as Promise<void>).finally(() => sample.close()),
      );
      data.close();
    },

    async finalize(): Promise<ArrayBuffer> {
      // Surface any VideoEncoder error captured out-of-band before flushing —
      // re-throwing here gives callers the original DOMException rather than
      // a generic InvalidStateError from a flush() on a broken encoder.
      if (videoEncoderError) throw videoEncoderError;
      // Flush video encoder first — all output callbacks must fire before we
      // can await the resulting mux Promises.
      await videoEncoder.flush();
      // Drain all pending video-packet and audio-sample encode Promises.
      await Promise.all(pendingVideo);
      await Promise.all(pendingAudio);
      // output.finalize() additionally flushes the audio encoder's internal
      // frame buffer (partial AAC frames), then writes the MP4 container
      // structure (moov box, etc.).
      await output.finalize();
      // BufferTarget.buffer is non-null after a successful finalize().
      return bufferTarget.buffer!;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }
      // output.cancel() force-closes all sources (including audioSource) and
      // releases internal resources.
      if (output.state !== 'finalized' && output.state !== 'canceled') {
        void output.cancel();
      }
    },
  };
}
