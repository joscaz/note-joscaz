import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// onnxruntime-web's runtime (WASM + .mjs loaders) is wired up via explicit
// `?url` imports in `src/services/onnx/session.ts` so Vite only ships the
// two variants we actually use (plain WASM-SIMD and the JSEP build used
// when WebGPU is available).
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
