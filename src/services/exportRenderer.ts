import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { advance, type RootStore } from '@react-three/fiber';
import * as Tone from 'tone';
import { Scene } from '../components/scene/Scene';
import type { ExportGraphicsOverride } from '../components/scene/Scene';
import type { NoteEvent } from './audioEngine';
import type { InstrumentType } from '../utils/noteColors';
import { EXPORT_PRESETS, computeExportFrameCount, type ExportQuality, type ExportQualityPreset } from '../types/exportPresets';

/**
 * Image format used for each captured frame. The backend's `_extract_frames`
 * step self-generates frame filenames as `frame_%06d.webp` and assumes the
 * bytes ARE WebP — it does not read the archive entry's extension. This is a
 * hard WEBP-ONLY contract: there is no fallback format. If the browser can't
 * encode WebP via canvas.toBlob, the export must fail loud BEFORE any
 * rendering/capture work starts (see assertWebpExportSupported), never
 * silently substitute JPEG bytes under a `.webp`-shaped contract.
 */
export type ExportFrameFormat = 'image/webp';

export interface ExportFrame {
  index: number;
  blob: Blob;
}

export interface ExportRenderOptions {
  notes: readonly NoteEvent[];
  instrument: InstrumentType;
  scrollSpeed: number;
  quality: ExportQuality;
  /** MIDI-derived audible duration in seconds (audioEngine.duration). */
  durationSec: number;
  /** WebP encode quality 0..1, passed straight through to canvas.toBlob. */
  imageQuality?: number;
  /** Called after each frame is captured; useful for progress UI (driven by WU4). */
  onProgress?: (capturedFrames: number, totalFrames: number) => void;
  /** Abort the capture loop early (checked between frames). */
  signal?: AbortSignal;
}

export interface ExportRenderResult {
  frames: ExportFrame[];
  frameFormat: ExportFrameFormat;
  preset: ExportQualityPreset;
  frameCount: number;
}

// WebP encode quality for captured frames. 0.72 (down from 0.85) trims each
// frame roughly 40% — the dominant lever on the frames-archive size — with
// negligible visible loss on the dark, bloom-heavy scene. Frames are the bulk
// of the upload (one still per frame, no temporal compression until the server
// muxes), so this directly raises the max exportable length before hitting the
// upload ceiling.
const DEFAULT_IMAGE_QUALITY = 0.72;

/** Setup-phase readiness wait (GLTF load + first Scene mount) — generous
 * since the Piano model is a real network fetch, but bounded so a stuck
 * load can never hang the export forever (see captureExportFrames's
 * try/finally — the timeout/abort path below is what makes that finally
 * actually reachable on a hang). */
const SETUP_READY_TIMEOUT_MS = 30_000;

/**
 * Resolves when `promise` resolves, or rejects if `timeoutMs` elapses or
 * `signal` aborts first — whichever comes first. Always clears its timer,
 * so it never leaves a dangling setTimeout behind. Used to bound the
 * storeReady/sceneReady setup wait in captureExportFrames so a stuck GLTF
 * load or missing onSceneReady call can't hang the export indefinitely
 * (FIX: previously a bare Promise.all with no timeout/signal handling).
 */
function withTimeoutAndAbort<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Export aborted', 'AbortError'));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Probes WebP support via `canvas.toBlob` BEFORE any export work (audio
 * render, frame capture) starts. Per MDN/spec, a browser without WebP
 * encoding silently falls back to PNG from `toBlob` (not an error/rejection)
 * — so the only reliable signal is checking the resulting Blob's `type`.
 *
 * The backend hardcodes `.webp` for every extracted frame and assumes WebP
 * bytes (no fallback decoder) — this app already requires WebGL, so every
 * supported browser also supports WebP-in-canvas, and a probe failure here
 * means we must fail the export loud and early rather than silently upload
 * a corrupt (non-WebP-but-named-.webp) archive.
 */
export async function assertWebpExportSupported(): Promise<void> {
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 1;
  probeCanvas.height = 1;

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      probeCanvas.toBlob((b) => resolve(b), 'image/webp');
    } catch {
      resolve(null);
    }
  });

  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Your browser does not support video export.');
  }
}

function captureFrameBlob(canvas: HTMLCanvasElement, format: ExportFrameFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`canvas.toBlob returned null (format=${format})`));
      },
      format,
      quality,
    );
  });
}

/**
 * Deterministic, step-driven frame capture for MP4 export (design §4).
 *
 * The 3D scene is a pure function of Tone.getTransport().seconds (see
 * FallingBars/Particles/audioEngine — no wall-clock term anywhere in the
 * render path). This lets us scrub the Transport to an exact frame time,
 * force ONE synchronous render via r3f's `advance()` (NOT invalidate(),
 * which only schedules a future rAF tick), and read the canvas back —
 * fully decoupled from real elapsed wall-clock time or frame drops.
 *
 * HOW THE SYNCHRONOUS RENDER IS FORCED IN "demand"/"never" MODE:
 * r3f's Canvas is mounted with `frameloop="never"` (via Scene's
 * exportOverride path) and FrameDriver's rAF/store-subscribe wiring is fully
 * disabled (exportMode flag). r3f's `advance(timestamp, runGlobalEffects,
 * state)` — exported from '@react-three/fiber' — runs every mounted
 * `useFrame` subscriber AND calls `gl.render(scene, camera)` synchronously in
 * the SAME tick, with no dependency on requestAnimationFrame (confirmed
 * against the installed @react-three/fiber@9.6.0 source: `update()` in
 * core/loop.js does `subscribers[i].ref.current(...)` then `gl.render(...)`
 * unconditionally when `internal.priority` is falsy). So calling
 * `advance(i / fps * 1000, true, store.getState())` after setting
 * `Tone.getTransport().seconds = i / fps` produces EXACTLY the frame for
 * that timestamp, on demand, with no timing slop.
 *
 * CRITICAL: the explicit `state` (3rd) argument to advance() is REQUIRED.
 * Per the installed source, `advance(timestamp)` with NO state arg loops
 * over r3f's GLOBAL `_roots` registry and updates every mounted Canvas — if
 * a live on-screen Scene happens to be mounted at the same time (which it
 * normally is, since export runs from the same page), an unscoped advance()
 * call would also force-render the live canvas off the Transport-scrub
 * timeline, corrupting what the user sees during export. We capture this
 * offscreen root's own RootStore via Scene's `onGlReady` (which now receives
 * the store, not just `gl`) and pass `store.getState()` explicitly so only
 * the offscreen export root advances.
 *
 * The Scene is mounted into an off-screen, visually-hidden container that IS
 * appended to document.body — r3f's <Canvas> sizes itself by measuring its
 * container via ResizeObserver, and a DETACHED node always measures 0x0
 * (regardless of inline width/height), which would yield a 0x0 WebGL viewport
 * and silently capture empty frames. The container renders at the export
 * preset's pixel resolution, with postFX + particles forced ON via Scene's
 * `exportOverride` prop (sourced from the EXPORT_PRESETS table — never from
 * useGraphicsStore, so the live thermal preset can't thin out the exported
 * video).
 *
 * Live playback is NOT touched: Tone.getTransport().seconds is mutated on
 * this offscreen capture's own render tree only insofar as the Transport
 * itself is a Tone.js singleton shared with the live scene — callers MUST
 * ensure the live Transport is paused/idle before calling this (WU4's
 * exportService is responsible for pausing playback and restoring
 * Transport.seconds afterward; this module does not manage that lifecycle).
 */
export async function captureExportFrames(options: ExportRenderOptions): Promise<ExportRenderResult> {
  const preset = EXPORT_PRESETS[options.quality];
  const frameCount = computeExportFrameCount(options.durationSec, preset);
  const imageQuality = options.imageQuality ?? DEFAULT_IMAGE_QUALITY;

  const exportOverride: ExportGraphicsOverride = {
    enablePostFX: preset.enablePostFX,
    enableParticles: preset.enableParticles,
    particlePoolSize: preset.particlePoolSize,
  };

  // Off-screen container, appended to document.body but visually hidden.
  // r3f's <Canvas> measures this node via ResizeObserver (react-use-measure)
  // to size its WebGL viewport — a DETACHED element reports a 0x0 content
  // rect no matter its inline width/height, which would capture empty frames.
  // It must be connected to the document to have real layout dimensions.
  // Hidden via opacity/pointer-events/z-index/off-screen position so it never
  // flashes on screen, and removed in the finally block below.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${preset.width}px`;
  container.style.height = `${preset.height}px`;
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  let root: Root | undefined;
  let store: RootStore;

  try {
    let resolveStore: (store: RootStore) => void;
    let resolveSceneReady: () => void;
    const storeReady = new Promise<RootStore>((resolve) => { resolveStore = resolve; });
    const sceneReady = new Promise<void>((resolve) => { resolveSceneReady = resolve; });

    const r = createRoot(container);
    root = r;
    r.render(
      createElement(Scene, {
        instrument: options.instrument,
        notes: options.notes,
        scrollSpeed: options.scrollSpeed,
        isPlaying: false,
        isVisible: true,
        exportOverride,
        onGlReady: (s) => resolveStore(s),
        // The Piano loads via Suspense (async GLTF) — capture must not start
        // (and advance() must not be called) until pianoHandle exists,
        // otherwise the earliest frames would render an empty scene (no
        // piano/bars/particles, since they only mount once pianoHandle is
        // set in Scene's state).
        onSceneReady: () => resolveSceneReady(),
      }),
    );

    // Bounded by both a timeout and options.signal: an unbounded Promise.all
    // here would hang forever if the GLTF load or onSceneReady never fires,
    // and the try/finally below would never run, leaking the off-screen
    // container + WebGL context (gl context is created as soon as
    // createRoot(...).render(...) mounts the Canvas, before either promise
    // resolves).
    [store] = await withTimeoutAndAbort(
      Promise.all([storeReady, sceneReady]),
      SETUP_READY_TIMEOUT_MS,
      options.signal,
      `Export setup timed out after ${SETUP_READY_TIMEOUT_MS}ms waiting for scene/store readiness`,
    );
    const gl = store.getState().gl;
    // gl.domElement is the canvas r3f rendered into — same one we read back from.
    const canvas = gl.domElement;
    // WEBP-ONLY contract (see assertWebpExportSupported's doc comment) — the
    // caller (exportService.runExport) MUST have already verified WebP
    // support before this function is ever invoked, so there is no runtime
    // branching/fallback here.
    const frameFormat: ExportFrameFormat = 'image/webp';

    const frames: ExportFrame[] = [];
    const transport = Tone.getTransport();

    for (let i = 0; i < frameCount; i++) {
      if (options.signal?.aborted) break;

      const tSeconds = i / preset.fps;
      transport.seconds = tSeconds;
      // advance() runs every useFrame subscriber (FallingBars/Particles/etc.)
      // AND calls gl.render(...) synchronously in this same call — no rAF
      // wait, no dependency on real elapsed time. Timestamp is in ms, so the
      // scene's own clock-delta bookkeeping stays monotonic across frames.
      // Passing store.getState() explicitly scopes the render to THIS
      // offscreen root only (see doc comment above this function).
      advance(tSeconds * 1000, true, store.getState());

      const blob = await captureFrameBlob(canvas, frameFormat, imageQuality);
      frames.push({ index: i, blob });
      options.onProgress?.(frames.length, frameCount);
    }

    return { frames, frameFormat, preset, frameCount };
  } finally {
    root?.unmount();
    container.remove();
  }
}
