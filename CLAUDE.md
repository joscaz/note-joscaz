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
  → Visualizer
      PianoRoll.tsx       60fps Canvas 2D; y-position derived from Tone.Transport.seconds
      PianoKeyboard.tsx   88-key highlight at hit line
      PlaybackControls    Transport, BPM, A/B switch, MIDI export
```

### Key Invariant

Piano roll reads `Tone.Transport.seconds` directly every frame — no accumulated delta time. This ensures frame-perfect sync indefinitely.

### Backend URL

Read from `import.meta.env.VITE_TRANSCRIBE_API_URL`, defaulting to `http://localhost:8000`. Set per-environment in `.env.development` / `.env.production`. `BackendStatus.tsx` polls `/health` every 30s to surface a ready/offline pill.

### State (App.tsx)

On mount, `generateMockMidi` fills the visualizer so landing is immediately live. File upload sets an AudioBuffer; `handleTranscribe` runs the pipeline; `audioEngine` loads audio+MIDI. `useAudioPlayer` hook wraps the engine singleton and drives a rAF loop for Transport time.

### Service Singletons

- `audioEngine.ts` — Transport, Player, piano+guitar Sampler, master gain (-4dB), A/B crossfade Gain nodes
- `transcriptionService.ts` — 3-stage orchestration (Uploading / Transcribing on server / Building MIDI) with progress callbacks

### Canvas Rendering

- `usePianoRoll` — 60fps rAF loop, manages note particles, derives positions from Transport.seconds
- `musicTheory.ts` — 88-key layout, MIDI↔note name conversion, black-key lookup
- `noteColors.ts` — piano green vs guitar purple/pink gradients, velocity→opacity

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
| Rendering | Canvas 2D (hand-written) |

## Tailwind Customizations

Custom colors: `piano-green`, `guitar-purple`, `guitar-pink`. Custom font: Aeonik Pro (Inter fallback). Custom animations: `shimmer`, `pulseRing`, `floaty`.
