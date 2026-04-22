# NoteJoscaz AI

Raw Audio → Perfect MIDI. A cinematic, Synthesia-style MIDI visualizer. The UI and visualizer run in the browser; transcription is handled by a self-hosted FastAPI backend.

Upload an MP3 or WAV, pick **Piano** or **Guitar**, and watch the transcribed MIDI play back over your original audio. Flip the **A/B source toggle** to swap between the original recording and the synthesized transcription — same Transport, zero drift.

Two visualizer modes, switchable from the pill toggle above the stage:

- **Legacy 2D** — hand-written 60fps Canvas 2D falling-note piano roll.
- **3D (Beta)** — Three.js scene with a Rousseau-style locked camera, instanced falling bars, GPU spark particles, bloom + vignette post-FX, and a live **Leva** tuning panel driven by 5 built-in themes (`default`, `neon`, `fire`, `water`, `crystal`).

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
- **Leva** — live tuning panel for 3D theme parameters
- **Zustand** — theme store (serializable `Theme` JSON — same object is intended to drive a future headless mp4 export path)
- **Tailwind CSS** + **Framer Motion** — design system and UI chrome

## Architecture

```
UploadZone  →  audioDecoder  →  transcriptionService  →  Midi
                                                         │
                                               audioEngine  (Tone.Transport)
                                                         │
                           ┌─────────────────────────────┼─────────────────────────────┐
                           ▼                             ▼                             ▼
                    Tone.Player (MP3)           Tone.Sampler / FMSynth         Tone.Transport.seconds
                       │                              │                                │
                       └──────── A/B Gain crossfade ──┘                                ▼
                                      │                                        PianoRoll (rAF)
                                   Destination                                 PianoKeyboard (rAF)
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

The 3D scene is fully described by a single serializable `Theme` JSON object (`src/types/theme.ts`) — camera, piano, bars, particles, post-FX. Five presets ship built-in (`src/themes/presets.ts`); the Leva panel at the top-right lets you live-tune every field and switch between them. Because the theme is serializable, the same code path is intended to run headless in Node for a future mp4 export.

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
    Hero.tsx              ─ full-viewport landing with particle canvas
    UploadZone.tsx        ─ drag/drop + waveform preview
    InstrumentSelector.tsx
    ProcessingOverlay.tsx ─ 4-stage pipeline animation
    PianoRoll.tsx         ─ Legacy: falling-notes canvas
    PianoKeyboard.tsx     ─ Legacy: 88-key canvas
    Visualizer.tsx        ─ Legacy 2D: composes roll + keyboard + controls
    Visualizer3D.tsx      ─ 3D Beta: mounts r3f Scene + ThemeControls + shared playback controls
    scene/
      Scene.tsx           ─ r3f orthographic Canvas + locked cinematic CameraController
      Piano.tsx           ─ procedural 88-key BoxGeometry + per-key press lerp
      FallingBars.tsx     ─ InstancedMesh bars, matrix per frame from Transport.seconds
      Particles.tsx       ─ GPU-driven spark bursts (ShaderMaterial, ring-buffer pool)
      PostFX.tsx          ─ Bloom (mipmapBlur) + ChromaticAberration + Vignette
      ThemeControls.tsx   ─ Leva panel bound to themeStore (scoped store per preset)
    PlaybackControls.tsx  ─ transport, BPM, A/B, download (shared)
    StatsGrid.tsx         ─ animated stat counters
    DesktopGate.tsx       ─ best-on-desktop gate for <900px
    Footer.tsx
  services/
    audioEngine.ts        ─ Tone.js orchestration (MP3 + synth, A/B crossfade)
    audioDecoder.ts       ─ decodeAudioData + waveform peaks
    transcriptionService.ts  ← MODEL INTEGRATION POINT
    midiExporter.ts       ─ .mid file download
    themeStore.ts         ─ zustand: { theme, presetName, setPreset, updateTheme } (3D)
  hooks/
    useAudioPlayer.ts     ─ React wrapper over audioEngine
    usePianoRoll.ts       ─ Legacy rAF loop + particle system
  themes/
    presets.ts            ─ default / neon / fire / water / crystal
  types/
    theme.ts              ─ serializable Theme JSON interface
  utils/
    musicTheory.ts        ─ midi→note name, isBlackKey, 88-key layout
    noteColors.ts         ─ piano/guitar gradients + velocity→opacity
    mockMidi.ts           ─ deterministic demo MIDI
    pianoModelMap.ts      ─ 3D: procedural 88-key generator (BoxGeometry)
  App.tsx                 ─ includes VizModeToggle (Legacy 2D ↔ 3D Beta)
  main.tsx
```

## License

MIT
