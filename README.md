# NoteForge AI

Raw Audio → Perfect MIDI. A cinematic, Synthesia-style MIDI visualizer that runs entirely in the browser.

Upload an MP3 or WAV, pick **Piano** or **Guitar**, and watch a 60fps falling-note piano roll play the transcribed MIDI over your original audio. Flip the **A/B source toggle** to swap between the original recording and the synthesized transcription — same Transport, zero drift.

![NoteForge AI](https://via.placeholder.com/1400x700/050508/00f5a0?text=NoteForge+AI)

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
- **Canvas 2D** — hand-written 60fps piano roll + 88-key renderer
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

- The piano roll's y-coordinate is derived from `Tone.Transport.seconds` **every frame** — never from an accumulated rAF delta — so audio and visuals stay frame-perfect in sync indefinitely.
- Source switching uses a 60ms gain ramp on two summed `Tone.Gain` nodes. Both sources are always scheduled on Transport so switching mid-playback is seamless.

## Transcription model

The real MIDI is produced by the `OnsetsAndVelocities` piano / guitar models from the sibling [`my-own-mt3`](../my-own-mt3) repo, exported to ONNX and run fully client-side with [onnxruntime-web](https://onnxruntime.ai/docs/tutorials/web/).

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

There is no backend. The entry point is still a single file:

```
src/services/transcriptionService.ts     transcribe() orchestration
src/services/onnx/audioPrep.ts            File → 16 kHz mono Float32Array
src/services/onnx/session.ts              lazy-loads & caches InferenceSession
src/services/onnx/chunker.ts              strided inference over long audio
src/services/onnx/decoder.ts              NMS peak picking + velocity gather
src/services/onnx/midiBuilder.ts          events → @tonejs/midi Midi
```

### Getting the model files

One-time export from the sibling repo:

```bash
cd ../my-own-mt3
source venv/bin/activate
pip install onnx onnxruntime        # for export + quantization
python export_onnx.py               # writes onnx_out/{piano,guitar}.onnx (+ .int8.onnx)
cp onnx_out/piano.int8.onnx  ../note-forge/public/models/piano.onnx
cp onnx_out/guitar.int8.onnx ../note-forge/public/models/guitar.onnx
```

If either `public/models/*.onnx` is missing the app gracefully falls back to the mock MIDI so the landing page always renders.

### What runs in the browser

1. `AudioContext.decodeAudioData` + `OfflineAudioContext` resample to 16 kHz mono.
2. `onnxruntime-web` runs the exported graph — which includes `TorchWavToLogmel` + `OnsetsAndVelocities` + `sigmoid` + `F.pad` — chunked at ~20 s with ~2 s overlap so long files don't blow the wasm heap.
3. The TypeScript port of `OnsetVelocityNmsDecoder` (Gaussian blur + 1-D NMS + velocity averaging) picks peaks.
4. `@tonejs/midi` assembles a `Midi` object with durations synthesized per pitch (sustain-until-next-onset, clamped).

Preference order for execution providers is WebGPU → WASM SIMD; pick whichever the browser supports.

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
    PianoRoll.tsx         ─ falling-notes canvas
    PianoKeyboard.tsx     ─ 88-key canvas
    Visualizer.tsx        ─ composes roll + keyboard + controls
    PlaybackControls.tsx  ─ transport, BPM, A/B, download
    StatsGrid.tsx         ─ animated stat counters
    DesktopGate.tsx       ─ best-on-desktop gate for <900px
    Footer.tsx
  services/
    audioEngine.ts        ─ Tone.js orchestration (MP3 + synth, A/B crossfade)
    audioDecoder.ts       ─ decodeAudioData + waveform peaks
    transcriptionService.ts  ← MODEL INTEGRATION POINT
    midiExporter.ts       ─ .mid file download
  hooks/
    useAudioPlayer.ts     ─ React wrapper over audioEngine
    usePianoRoll.ts       ─ rAF loop + particle system
  utils/
    musicTheory.ts        ─ midi→note name, isBlackKey, 88-key layout
    noteColors.ts         ─ piano/guitar gradients + velocity→opacity
    mockMidi.ts           ─ deterministic demo MIDI
  App.tsx
  main.tsx
```

## License

MIT
