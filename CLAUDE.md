# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # Serve built dist/
```

No test suite exists. To add one: `npm install --save-dev vitest`.

## Architecture

**NoteJoscaz AI** — audio-to-MIDI transcription and piano roll visualizer. The browser handles UI, audio decoding, and playback; transcription is delegated to a self-hosted PyTorch backend (`note-joscaz-backend`, FastAPI on Railway).

### Data Flow

```
Upload (MP3/WAV)
  → audioDecoder.ts       WebAudio API → AudioBuffer (used for waveform preview + duration estimate)
  → transcriptionService.ts
      multipart POST ${VITE_TRANSCRIBE_API_URL}/transcribe/{piano|guitar}
      → audio/midi bytes → new Midi(Uint8Array)
      Fallback: generateMockMidi() if the backend is unreachable
  → audioEngine.ts        Singleton: Tone.Transport + Player + Sampler/PolySynth + A/B crossfade
  → VisualizerComponent (user-toggled — see "Visualizer Modes")
      Legacy 2D path: Visualizer.tsx
        PianoRoll.tsx       60fps Canvas 2D; y-position derived from Tone.Transport.seconds
        PianoKeyboard.tsx   88-key highlight at hit line
      3D Beta path: Visualizer3D.tsx
        scene/Scene.tsx         r3f orthographic Canvas + locked cinematic camera
        scene/Piano.tsx         procedurally generated 88-key model (BoxGeometry), per-key press lerp
        scene/FallingBars.tsx   InstancedMesh of bars; matrix rebuilt each frame from Transport.seconds
        scene/Particles.tsx     GPU-driven spark bursts (ShaderMaterial + pooled BufferAttributes)
        scene/PostFX.tsx        EffectComposer: Bloom (mipmapBlur) + ChromaticAberration + Vignette
        scene/ThemeControls.tsx Leva panel bound to themeStore
      PlaybackControls    Transport, BPM, A/B switch, MIDI export (shared by both paths)
```

### Key Invariant

Both visualizers read `Tone.Transport.seconds` directly every frame — no accumulated delta time. This ensures frame-perfect sync indefinitely. The 2D path uses it for y-pixel math; the 3D `FallingBars` uses it to derive each bar's scene-space matrix per frame.

### Visualizer Modes

The user switches between **Legacy 2D** and **3D (Beta)** via the `VizModeToggle` pill rendered above the visualizer. State is held in `App.tsx`:

- Source of truth: `vizMode: 'legacy' | 'beta'` — persisted to `localStorage` under `noteforge:vizMode`.
- URL override (shareable): `?v=3d` or `?v=2d` (also accepted as `#v=3d` / `#v=2d`) wins over stored value on load. Useful for forcing a mode in links/docs.
- Default on first visit: `beta` (3D).
- `readInitialVizMode()` resolves the priority: URL → localStorage → default.

Swapping modes unmounts/remounts the entire visualizer subtree — audio engine + Transport are untouched (singletons outside the subtree), so playback continues seamlessly across the swap.

### 3D Scene Architecture (`src/components/scene/*`)

Scene is **fully described by a `Theme` JSON object** (`src/types/theme.ts`) — camera, piano, bars, particles, post-FX. Same object drives the browser live render and is intended to drive a future headless Node mp4 export path, so every field is serializable (no functions, no refs).

- `services/themeStore.ts` — zustand store. `{ theme, presetName, setPreset(), updateTheme(patch) }`. `updateTheme` uses an internal `deepMerge` so slider edits can patch nested slices without clobbering siblings.
- `themes/presets.ts` — five presets: `default`, `neon`, `fire`, `water`, `crystal`. `DEFAULT_PRESET = 'default'`.
- `scene/ThemeControls.tsx` — Leva panel. Preset-switch reset is tricky: Leva's module-global store would otherwise replay stale slider values into onChange and clobber the preset via `deepMerge`. Fix: `ThemeControls` wraps an `InnerPanel` keyed on `presetName`; `InnerPanel` calls `useCreateStore()` for a scoped Leva store + `<LevaPanel store={store} />`. On preset change the inner panel remounts with a fresh scoped store, registering controls cleanly with new defaults. **Do not add `[deps]` to the `useControls` calls** — that reintroduces the stale-replay clobber.
- Scene components subscribe to narrow slices via `useThemeStore((s) => s.theme.xxx)` selectors so unrelated param changes don't re-render everything. Per-frame-hot values (e.g. `pressDepth`, `pressEmissiveIntensity`) are read inside `useFrame` via `useThemeStore.getState()` to avoid React re-render churn.
- Camera is locked (no OrbitControls). `Scene.tsx`'s `CameraController` reads `theme.camera.{tiltDeg,distance,offsetYFrac}` and the piano's `modelWidth`/`modelCenterX` to compute orthographic zoom + position — Rousseau-style framing, piano pinned near the bottom.
- `Piano.tsx` procedurally generates 88 keys with plain `BoxGeometry` (no GLB loading). `reality3d/3d-piano-player` inspired the per-key press animation: exp-decay lerp with `ATTACK_TAU = 0.025` / `RELEASE_TAU = 0.15`. Emissive glow ramps with press amount × `theme.piano.pressEmissiveIntensity`.
- `FallingBars.tsx` uses one `InstancedMesh` with capacity = note count. `key={count}` remounts the mesh when a different-length MIDI loads (InstancedMesh capacity is fixed at construction). Off-window bars collapse to `scale 0`.
- `Particles.tsx` pools `poolSize` particles in a ring buffer. All motion is done in the vertex shader (`pos + vel*age + 0.5*g*age²`) — no per-frame CPU attribute writes. Emission fires on note-on edges detected by diffing the `audioEngine.onActiveNotes` set.
- `PostFX.tsx` uses mipmapBlur bloom — bars + pressed keys render `toneMapped={false}` with emissive > 1 so they cross the bloom luminance threshold while matte piano body + fog stay clean.

### Backend URL

Read from `import.meta.env.VITE_TRANSCRIBE_API_URL`, defaulting to `http://localhost:8000`. Set per-environment in `.env.development` / `.env.production`. `BackendStatus.tsx` polls `/health` every 30s to surface a ready/offline pill.

### State (App.tsx)

On mount, `generateMockMidi` fills the visualizer so landing is immediately live. File upload sets an AudioBuffer; `handleTranscribe` runs the pipeline; `audioEngine` loads audio+MIDI. `useAudioPlayer` hook wraps the engine singleton and drives a rAF loop for Transport time.

`vizMode` lives at `LandingPage` level (see "Visualizer Modes"); `<VizModeToggle>` is the segmented pill rendered above the visualizer.

### Service Singletons

- `audioEngine.ts` — Transport, Player, piano+guitar Sampler, master gain (-4dB), A/B crossfade Gain nodes
- `transcriptionService.ts` — 3-stage orchestration (Uploading / Transcribing on server / Building MIDI) with progress callbacks

### Canvas Rendering (Legacy 2D path)

- `usePianoRoll` — 60fps rAF loop, manages note particles, derives positions from Transport.seconds
- `musicTheory.ts` — 88-key layout, MIDI↔note name conversion, black-key lookup
- `noteColors.ts` — piano green vs guitar purple/pink gradients, velocity→opacity

### 3D Rendering (Beta path)

See "3D Scene Architecture" above. Stack: Three.js + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` + `leva` (tuning panel) + `zustand` (theme store).

## Stack

| Layer | Tech |
|-------|------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Audio | Tone.js 15 (Transport, Player, Sampler for piano + acoustic guitar) |
| MIDI | @tonejs/midi 2 |
| Transcription | self-hosted FastAPI + PyTorch (`note-joscaz-backend`) |
| Animation | Framer Motion 12 |
| Styling | Tailwind CSS 3 |
| Rendering (Legacy) | Canvas 2D (hand-written) |
| Rendering (3D Beta) | Three.js + r3f + drei + postprocessing |
| 3D tuning UI | Leva 0.10 |
| 3D state | Zustand 5 |

## Tailwind Customizations

Custom colors: `piano-green`, `guitar-purple`, `guitar-pink`. Custom font: Aeonik Pro (Inter fallback). Custom animations: `shimmer`, `pulseRing`, `floaty`.
