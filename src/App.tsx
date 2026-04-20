import { useCallback, useEffect, useRef, useState } from 'react';
import type { Midi } from '@tonejs/midi';
import { Hero } from './components/Hero';
import { UploadZone } from './components/UploadZone';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { Visualizer } from './components/Visualizer';
import { Footer } from './components/Footer';
import { DesktopGate } from './components/DesktopGate';
import { TrainingPage } from './components/TrainingPage';
import { useHashRoute } from './hooks/useHashRoute';
import { decodeAudioFile } from './services/audioDecoder';
import { transcribe } from './services/transcriptionService';
import { audioEngine } from './services/audioEngine';
import { generateMockMidi } from './utils/mockMidi';
import type { InstrumentType } from './utils/noteColors';

export default function App() {
  const route = useHashRoute();
  if (route.startsWith('/training')) {
    return (
      <DesktopGate>
        <TrainingPage />
      </DesktopGate>
    );
  }
  return <LandingPage />;
}

function LandingPage() {
  const [instrument, setInstrument] = useState<InstrumentType>('piano');
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [midi, setMidi] = useState<Midi | null>(null);
  const [isReal, setIsReal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Decoding audio');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const uploadRef = useRef<HTMLDivElement>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);

  // Preload a "demo" MIDI so the visualizer has something to show even before
  // the user uploads — great for first-impression landing on the page.
  useEffect(() => {
    const demo = generateMockMidi('piano');
    void (async () => {
      await audioEngine.loadInstruments();
      audioEngine.loadMidi(demo, 'piano');
      audioEngine.setSource('synth');
      setMidi(demo);
    })();
  }, []);

  const scrollTo = (el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFileReady = useCallback((f: File, buf: AudioBuffer) => {
    setFile(f);
    setBuffer(buf);
    void audioEngine.loadAudio(buf);
  }, []);

  const handleInstrumentChange = useCallback(
    (i: InstrumentType) => {
      setInstrument(i);
      // If we already have a transcription, re-synth with the new instrument
      // so the A/B toggle keeps working.
      if (midi) {
        audioEngine.loadMidi(midi, i);
      }
    },
    [midi],
  );

  const handleTranscribe = useCallback(async () => {
    setBusy(true);
    setOverlayOpen(true);
    setProgress(0);
    setStage('Decoding audio');
    try {
      await audioEngine.loadInstruments();
      const result = await transcribe(buffer, instrument, {
        file: file ?? undefined,
        onProgress: (p, s) => {
          setProgress(p);
          setStage(s);
        },
      });
      setMidi(result.midi);
      setIsReal(result.real);
      audioEngine.loadMidi(result.midi, instrument);
      audioEngine.setBpm(result.bpm);
      // When the backend returns real MIDI and we have an original file,
      // default to A/B so the user hears original + synth side by side.
      // Otherwise (mock fallback path) synth-only.
      audioEngine.setSource(result.real ? 'both' : 'synth');
      audioEngine.restart();
      await new Promise((r) => setTimeout(r, 350));
      setOverlayOpen(false);
      setTimeout(() => scrollTo(visualizerRef.current), 250);
    } catch (e) {
      console.error(e);
      setOverlayOpen(false);
    } finally {
      setBusy(false);
    }
  }, [buffer, file, instrument]);

  return (
    <DesktopGate>
      <main className="relative min-h-screen">
        <Hero onCtaClick={() => scrollTo(uploadRef.current)} />

        <div ref={uploadRef}>
          <UploadZone
            instrument={instrument}
            onInstrumentChange={handleInstrumentChange}
            onFileReady={handleFileReady}
            decode={decodeAudioFile}
            onTranscribe={handleTranscribe}
            audioBuffer={buffer}
            fileName={file?.name ?? null}
            busy={busy}
          />
        </div>

        <div ref={visualizerRef} className="py-10 md:py-16">
          {midi ? (
            <Visualizer
              midi={midi}
              instrument={instrument}
              fileName={file?.name ?? 'Demo · Mock MIDI'}
              isRealTranscription={isReal}
            />
          ) : (
            <div className="text-center text-muted font-mono text-sm py-20">
              Loading demo…
            </div>
          )}
        </div>

        <Footer />

        <ProcessingOverlay open={overlayOpen} progress={progress} stage={stage} instrument={instrument} />
      </main>
    </DesktopGate>
  );
}
