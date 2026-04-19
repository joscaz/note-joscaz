/**
 * Lazy-loading onnxruntime-web session manager.
 *
 * - Configures `env.wasm.wasmPaths` to point at `/ort/` (populated by
 *   `viteStaticCopy` in `vite.config.ts`).
 * - Caches one `InferenceSession` per instrument so repeated transcriptions
 *   reuse the same compiled graph.
 * - Tries WebGPU first, falls back to WASM (with SIMD + threads when the
 *   environment allows it).
 */

import * as ort from 'onnxruntime-web';
import type { InstrumentType } from '../../utils/noteColors';

// Vite's default resolution of `onnxruntime-web` picks the bundle build,
// which carries both the CPU kernels and the JSEP (WebGPU/WebNN) kernels in
// a single `ort-wasm-simd-threaded.jsep.{wasm,mjs}` pair. We point the
// runtime at Vite-hashed copies of those exact files so only what we use
// gets shipped.
import ortJsepWasm from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import ortJsepMjs from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';

let envConfigured = false;

function configureOrtEnv() {
  if (envConfigured) return;
  envConfigured = true;

  ort.env.wasm.wasmPaths = {
    wasm: ortJsepWasm,
    mjs: ortJsepMjs,
  };

  // Threads require cross-origin-isolation (COOP+COEP). We can't assume
  // those headers, so default to 1 thread; a deploy that sets them can
  // bump this at runtime.
  ort.env.wasm.numThreads = 1;

  ort.env.logLevel = 'warning';
}

type Instrument = InstrumentType;

interface LoadStatus {
  instrument: Instrument;
  progress: number; // 0..1 download progress, or 1 once cached
  bytesLoaded: number;
  bytesTotal: number | null;
}

export type LoadProgressCallback = (status: LoadStatus) => void;

const MODEL_URLS: Record<Instrument, string> = {
  piano: 'models/piano.onnx',
  guitar: 'models/guitar.onnx',
};

const sessionCache = new Map<Instrument, Promise<ort.InferenceSession>>();

/** Returns (and caches) an ORT session for the given instrument. */
export function getSession(
  instrument: Instrument,
  onProgress?: LoadProgressCallback,
): Promise<ort.InferenceSession> {
  configureOrtEnv();

  const cached = sessionCache.get(instrument);
  if (cached) return cached;

  const promise = loadSession(instrument, onProgress).catch((err) => {
    // Don't hold a rejected promise in the cache — the next caller should be
    // allowed to retry.
    sessionCache.delete(instrument);
    throw err;
  });
  sessionCache.set(instrument, promise);
  return promise;
}

async function loadSession(
  instrument: Instrument,
  onProgress?: LoadProgressCallback,
): Promise<ort.InferenceSession> {
  const url = new URL(MODEL_URLS[instrument], document.baseURI).toString();
  const bytes = await fetchWithProgress(url, (loaded, total) => {
    onProgress?.({
      instrument,
      progress: total ? loaded / total : 0,
      bytesLoaded: loaded,
      bytesTotal: total,
    });
  });

  // Signal that download is done — the rest is synchronous compile work.
  onProgress?.({
    instrument,
    progress: 1,
    bytesLoaded: bytes.byteLength,
    bytesTotal: bytes.byteLength,
  });

  const providers: ort.InferenceSession.ExecutionProviderConfig[] = [];
  if (await webgpuAvailable()) providers.push('webgpu');
  providers.push('wasm');

  // Graph-level optimizations pre-compute constant folds for our log-mel
  // filterbank + window.
  return ort.InferenceSession.create(bytes, {
    executionProviders: providers,
    graphOptimizationLevel: 'all',
  });
}

async function webgpuAvailable(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpu = (navigator as any).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }

  const lenHeader = resp.headers.get('content-length');
  const total = lenHeader ? Number(lenHeader) : null;

  // Some browsers / configs won't give us a streaming body (e.g. old
  // Safari). Fall back to a single arrayBuffer read in that case.
  if (!resp.body) {
    const buf = await resp.arrayBuffer();
    onProgress(buf.byteLength, total);
    return buf;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }

  const merged = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return merged.buffer;
}

/** Returns true if a session for the given instrument has already been loaded. */
export function isSessionLoaded(instrument: Instrument): boolean {
  return sessionCache.has(instrument);
}
