# NoteJoscaz AI

Raw Audio → Perfect MIDI. A cinematic, Synthesia-style MIDI visualizer. The UI and visualizer run in the browser; transcription is handled by a self-hosted FastAPI backend.

Three ways to get MIDI into the visualizer:

1. **Transcribe** — upload an MP3 or WAV, pick **Piano** or **Guitar**, and watch the transcribed MIDI play back over your original audio. Flip the **A/B source toggle** to swap between the original recording and the synthesized transcription — same Transport, zero drift.
2. **Curated Library** — play high-fidelity hand-crafted MIDI arrangements from the built-in collection, organized by genre and difficulty. Requires sign-in.
3. **Upload MIDI** — drop your own `.mid` / `.midi` file directly; it is parsed in-browser and visualized instantly without any server round-trip. Session-only (not persisted). Requires sign-in.

Two visualizer modes, switchable from the pill toggle above the stage:

- **Legacy 2D** — hand-written 60fps Canvas 2D falling-note piano roll.
- **3D (Beta)** — Three.js scene with a Rousseau-style locked camera, instanced falling bars, GPU spark particles, bloom + vignette post-FX, and two custom side panels: a **Theme** panel driven by 5 built-in themes (`default`, `neon`, `fire`, `water`, `crystal`) and a **Graphics** panel for live quality/performance tuning.

Works on both desktop and mobile viewports.

![NoteJoscaz AI](https://via.placeholder.com/1400x700/050508/00f5a0?text=NoteJoscaz+AI)

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. A demo MIDI is preloaded so the visualizer is live immediately; drop an MP3 to transcribe your own.

## Build

```bash
npm run build && npm run preview
```

## Stack

- **Vite + React + TypeScript**
- **Tone.js** — transport, scheduling, sampler/synth playback
- **@tonejs/midi** — MIDI parsing, serialization, MIDI file export
- **Canvas 2D** — Legacy visualizer: hand-written 60fps piano roll + 88-key renderer
- **Three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing** — 3D Beta visualizer (orthographic cinematic scene, InstancedMesh bars, GPU particles, Bloom + ChromaticAberration + Vignette)
- **Zustand** — two serializable stores: `themeStore` (the `Theme` JSON — same object is intended to drive a future headless mp4 export path) and `graphicsStore` (quality/performance settings, persisted to `localStorage`)
- **Custom React + Framer Motion panels** — `ThemePanel` (live-tune the 3D theme) and `GraphicsPanel` (quality presets), both hand-built (no Leva dependency)
- **Tailwind CSS** + **Framer Motion** — design system and UI chrome

## Architecture

Three MIDI sources all converge at the same `audioEngine` pipeline:

```
UploadZone ──► audioDecoder ──► transcriptionService ──► Midi ─┐
                                                                │
CuratedLibrary ──► Supabase Storage ──► new Midi(ArrayBuffer) ─┤
                                                                │
UserMidiUpload ──► File.arrayBuffer() ──► new Midi(ArrayBuffer)─┤
                                                                ▼
                                                    audioEngine  (Tone.Transport)
                                                                │
                           ┌────────────────────────────────────┼──────────────────────────────────┐
                           ▼                                    ▼                                  ▼
                    Tone.Player (MP3)              Tone.Sampler / FMSynth              Tone.Transport.seconds
                       │                                    │                                      │
                       └──────────── A/B Gain crossfade ───┘                                       ▼
                                           │                                               PianoRoll (rAF)
                                        Destination                                        PianoKeyboard (rAF)
```

- The visualizer derives position from `Tone.Transport.seconds` **every frame** — never from an accumulated rAF delta — so audio and visuals stay frame-perfect in sync indefinitely. This invariant holds identically in both modes: 2D uses it for y-pixel math, the 3D `FallingBars` uses it to rebuild each instanced bar's matrix.
- Source switching uses a 60ms gain ramp on two summed `Tone.Gain` nodes. Both sources are always scheduled on Transport so switching mid-playback is seamless.
- Mode toggle (Legacy 2D ↔ 3D Beta) swaps only the visualizer subtree — the audio engine is a singleton outside that subtree, so playback keeps going across the swap.

## Visualizer modes

Toggle via the pill above the stage. State is persisted to `localStorage` under `noteforge:vizMode`. First-visit default is **3D (Beta)**.

Shareable URL overrides (win over the stored value on load):

- `?v=3d` or `#v=3d` — force 3D Beta
- `?v=2d` or `#v=2d` — force Legacy 2D

### 3D theme system

The 3D scene is fully described by a single serializable `Theme` JSON object (`src/types/theme.ts`) — camera, piano, bars, particles, post-FX. Five presets ship built-in (`src/themes/presets.ts`); the custom `ThemePanel` (`src/components/ThemePanel.tsx`) lets you live-tune every field and switch between them. Because the theme is serializable, the same code path is intended to run headless in Node for a future mp4 export.

Separately, a `GraphicsPanel` (`src/components/GraphicsPanel.tsx`) controls **how hard the GPU/CPU works** — independent of how the scene looks. It is backed by `graphicsStore` (`src/services/graphicsStore.ts`) and a `GraphicsSettings` shape (`src/types/graphics.ts`): a `quality` preset (`low` | `medium` | `high`, default `medium`), `fpsCap`, post-FX and particle toggles, particle pool size, and render `dpr`. Settings persist to `localStorage`. Presets live in `src/themes/graphicsPresets.ts`.

### Re-strike seam (guitar)

Guitar transcriptions carry long per-string sustains, so two back-to-back notes on the same pitch would otherwise render as one continuous bar with no visible re-strike. `FallingBars` precomputes a `trimTop` flag per note: if the next same-MIDI note starts within 0.15s of this one's end, the bar's top edge is shaved by `0.05s × scrollSpeed` at render time — producing a crisp seam at the re-strike that stays the same visual size regardless of scroll speed. Isolated notes are untouched.

## Transcription model

The real MIDI is produced by the `OnsetsAndVelocities` piano / guitar models, served from the self-hosted [`note-joscaz-backend`](../note-joscaz-backend) FastAPI service (PyTorch, deployed on Railway). The frontend POSTs the raw upload to `POST /transcribe/{instrument}` and plays the returned `.mid`.

### Credits

The underlying Onsets & Velocities architecture and the piano model were developed by the **IAMúsica** project — supported by research grant 389062, INV-23/2021 from the *Institut d'Estudis Baleàrics* — and composed of:

- Eulàlia Febrer Coll
- Joan Lluís Travé Pla
- Andrés Fernández Rodríguez

Their work is Free/Libre and Open Source Software. See the paper and accompanying repo for the full story. If you build on this, please cite:

> Andrés Fernández. *Onsets and Velocities: Affordable Real-Time Piano Transcription Using Convolutional Neural Networks*. EUSIPCO 2023. [arXiv:2303.04485](https://arxiv.org/abs/2303.04485)

```bibtex
@inproceedings{onsvel,
  title     = {{Onsets and Velocities}: Affordable Real-Time Piano Transcription Using Convolutional Neural Networks},
  author    = {Andres Fernandez},
  year      = {2023},
  booktitle = {{EUSIPCO} Proceedings},
}
```

The **guitar** model shipped here is the IAMúsica piano architecture fine-tuned on guitar data for this project; all credit for the original architecture, training code, and piano weights goes to the authors above.

The integration point on the frontend is a single file:

```
src/services/transcriptionService.ts   POST /transcribe/{instrument} + mock fallback
```

### Backend configuration

Point the frontend at the backend via a Vite env var:

```bash
# .env.development (committed default)
VITE_TRANSCRIBE_API_URL=http://localhost:8000

# .env.production (fill in before `npm run build`)
VITE_TRANSCRIBE_API_URL=https://your-railway-app.up.railway.app
```

Run the backend locally:

```bash
cd ../note-joscaz-backend
uvicorn app.main:app --reload --port 8000
```

If the backend is unreachable the frontend gracefully falls back to mock MIDI so the landing page always renders.

## Controls

| Action              | Shortcut                   |
| ------------------- | -------------------------- |
| Play / Pause        | `Space`                    |
| Restart             | `R`                        |
| Seek ±5s            | `←` / `→`                  |
| Scroll speed ±20    | `↑` / `↓`                  |
| Source: MP3 / A/B / MIDI | three-position switch in the control bar |

## File map

```
src/
  components/
    Hero.tsx                  ─ full-viewport landing with particle canvas
    UploadZone.tsx            ─ audio drag/drop + waveform preview, MIDI upload card, curated library grid
    InstrumentSelector.tsx
    ProcessingOverlay.tsx     ─ 4-stage pipeline animation
    PianoRoll.tsx             ─ Legacy: falling-notes canvas
    PianoKeyboard.tsx         ─ Legacy: 88-key canvas
    Visualizer.tsx            ─ Legacy 2D: composes roll + keyboard + controls
    Visualizer3D.tsx          ─ 3D Beta: mounts r3f Scene + ThemePanel + GraphicsPanel + shared playback controls
    ThemePanel.tsx            ─ 3D: custom theme-tuning panel (presets + per-field live edit) bound to themeStore
    GraphicsPanel.tsx         ─ 3D: quality/performance panel (quality preset, fps cap, post-FX/particle toggles) bound to graphicsStore
    AuthBadge.tsx             ─ top-right sign-in/out badge
    AuthModal.tsx             ─ sign-in / sign-up modal (Supabase Auth)
    AuthPage.tsx              ─ full-page auth route (/login, /signup)
    BackendStatus.tsx         ─ backend health indicator (polls VITE_TRANSCRIBE_API_URL)
    LimitReachedDialog.tsx    ─ modal shown when daily transcription limit is hit
    MidiBackground.tsx        ─ decorative MIDI-note background canvas
    TrainingPage.tsx          ─ /training route shell
    scene/
      Scene.tsx               ─ r3f orthographic Canvas + locked cinematic CameraController
      Piano.tsx               ─ procedural 88-key BoxGeometry + per-key press lerp
      FallingBars.tsx         ─ InstancedMesh bars, matrix per frame from Transport.seconds
      Particles.tsx           ─ GPU-driven spark bursts (ShaderMaterial, ring-buffer pool)
      PostFX.tsx              ─ Bloom (mipmapBlur) + ChromaticAberration + Vignette
    training/
      PianoTraining.tsx       ─ piano training content
      GuitarTraining.tsx      ─ guitar training content
      TrainingHero.tsx        ─ training page hero section
      Prose.tsx               ─ styled prose wrapper for training copy
    PlaybackControls.tsx      ─ transport, BPM, A/B, download (shared)
    StatsGrid.tsx             ─ animated stat counters
    Footer.tsx
  services/
    audioEngine.ts            ─ Tone.js orchestration (MP3 + synth, A/B crossfade)
    audioDecoder.ts           ─ decodeAudioData + waveform peaks
    transcriptionService.ts   ← MODEL INTEGRATION POINT
    midiExporter.ts           ─ .mid file download
    authStore.ts              ─ Zustand store wrapping Supabase Auth (session, user, dailyCount)
    supabaseClient.ts         ─ Supabase client singleton (auth + storage)
    themeStore.ts             ─ Zustand: { theme, presetName, setPreset, updateTheme } (3D)
    graphicsStore.ts          ─ Zustand: quality/performance settings, persisted to localStorage (3D)
  hooks/
    useAudioPlayer.ts         ─ React wrapper over audioEngine
    useHashRoute.ts           ─ hash-based client-side router (navigate, useHashRoute)
    useMediaQuery.ts          ─ window.matchMedia hook with change listener
    usePianoRoll.ts           ─ Legacy rAF loop + particle system
  themes/
    presets.ts                ─ default / neon / fire / water / crystal
    graphicsPresets.ts        ─ low / medium / high quality presets (default: medium)
  types/
    theme.ts                  ─ serializable Theme JSON interface
    graphics.ts               ─ GraphicsSettings interface (quality, fpsCap, dpr, toggles)
  utils/
    curatedMidis.ts           ─ static metadata for the curated MIDI collection
    musicTheory.ts            ─ midi→note name, isBlackKey, 88-key layout
    noteColors.ts             ─ piano/guitar gradients + velocity→opacity
    mockMidi.ts               ─ deterministic demo MIDI
    pianoModelMap.ts          ─ 3D: procedural 88-key generator (BoxGeometry)
  App.tsx                     ─ root router + LandingPage (VizModeToggle, all MIDI source handlers)
  main.tsx
```

## License

MIT
