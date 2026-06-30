/**
 * Export quality tiers — resolution/fps/bitrates for the client-side MP4
 * encode. These are DISTINCT from the live GRAPHICS_PRESETS
 * (src/themes/graphicsPresets.ts), which only govern "how hard the GPU/CPU
 * works while you watch it play" for thermal safety. The export preset
 * controls "what gets baked into the downloaded video" and must NOT be
 * confused with or derived from the live preset — see design §7.
 *
 * postFX + particles are FORCED ON for every export quality (REV 2 decision
 * 3), independent of whatever the live preset currently has selected. The
 * export-time graphics override (ExportGraphicsOverride, see
 * exportRenderer.ts) is sourced from this table, never from useGraphicsStore.
 */

export const ExportQuality = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
} as const;

export type ExportQuality = (typeof ExportQuality)[keyof typeof ExportQuality];

export interface ExportQualityPreset {
  quality: ExportQuality;
  width: number;
  height: number;
  fps: 24 | 30 | 60 | 120;
  /** H.264 video bitrate in bits-per-second. */
  videoBitrate: number;
  /** AAC audio bitrate in bits-per-second. */
  audioBitrate: number;
  /** Forced ON for every export tier — never read from the live graphics preset. */
  enablePostFX: true;
  enableParticles: true;
  /** Uses the live "high" preset's pool size so export particles never look thinner than live-high. */
  particlePoolSize: number;
}

export const EXPORT_PRESETS: Record<ExportQuality, ExportQualityPreset> = {
  low: {
    quality: 'low',
    width: 854,
    height: 480,
    fps: 24,
    videoBitrate: 2_500_000,
    audioBitrate: 128_000,
    enablePostFX: true,
    enableParticles: true,
    particlePoolSize: 2048,
  },
  medium: {
    quality: 'medium',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrate: 5_000_000,
    audioBitrate: 192_000,
    enablePostFX: true,
    enableParticles: true,
    particlePoolSize: 2048,
  },
  high: {
    quality: 'high',
    width: 1920,
    height: 1080,
    // 1080p120 exceeds H.264 Level 4.2 (~1080p64 ceiling), so resolveH264Codec
    // must negotiate a Level 5.2 codec string — see H264_CANDIDATES in
    // exportMuxer.ts. Bitrate is raised from 10 to 30 Mbps because the 4x frame
    // rate otherwise starves high-motion regions (falling bars / particles) and
    // produces visible blocking.
    fps: 120,
    videoBitrate: 30_000_000,
    audioBitrate: 192_000,
    enablePostFX: true,
    enableParticles: true,
    particlePoolSize: 2048,
  },
};

export const DEFAULT_EXPORT_QUALITY: ExportQuality = 'medium';

/**
 * Frame count for a full export, derived from the MIDI's audible duration
 * (audioEngine.duration, i.e. maxNoteEnd + an instrument-aware release tail —
 * see tailPadSecFor in audioEngine.ts) and the chosen preset's fps. ceil() so
 * the last partial frame interval is still captured.
 */
export function computeExportFrameCount(durationSec: number, preset: ExportQualityPreset): number {
  return Math.ceil(durationSec * preset.fps);
}
