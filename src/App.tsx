import { useCallback, useEffect, useRef, useState } from 'react';
import { Midi } from '@tonejs/midi';
import { Hero } from './components/Hero';
import { UploadZone } from './components/UploadZone';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { Visualizer } from './components/Visualizer';
import { Visualizer3D } from './components/Visualizer3D';
import { Footer } from './components/Footer';
import { TrainingPage } from './components/TrainingPage';
import { AuthPage } from './components/AuthPage';
import { useHashRoute, navigate } from './hooks/useHashRoute';
import { decodeAudioFile } from './services/audioDecoder';
import { transcribe } from './services/transcriptionService';
import { audioEngine } from './services/audioEngine';
import { useAuthStore } from './services/authStore';
import { generateMockMidi } from './utils/mockMidi';
import { AuthBadge } from './components/AuthBadge';
import { LimitReachedDialog } from './components/LimitReachedDialog';
import { TranscriptionLimitError } from './services/transcriptionService';
import type { InstrumentType } from './utils/noteColors';
import { curatedMidis } from './utils/curatedMidis';
import type { CuratedMidi } from './utils/curatedMidis';
import { supabase } from './services/supabaseClient';

function VizModeToggle({ value, onChange }: { value: VizMode; onChange: (v: VizMode) => void }) {
  const base = 'px-3 py-1.5 text-xs font-mono uppercase tracking-[0.18em] transition-colors';
  const active = 'bg-white/10 text-text';
  const idle = 'text-muted hover:text-text';
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 backdrop-blur p-1">
      <button
        type="button"
        className={`${base} rounded-full ${value === 'legacy' ? active : idle}`}
        onClick={() => onChange('legacy')}
      >
        Legacy 2D
      </button>
      <button
        type="button"
        className={`${base} rounded-full flex items-center gap-1.5 ${value === 'beta' ? active : idle}`}
        onClick={() => onChange('beta')}
      >
        3D
        <span className="px-1.5 py-0.5 text-[9px] leading-none rounded-sm bg-piano-green/20 text-piano-green border border-piano-green/30">
          BETA
        </span>
      </button>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  if (route.startsWith('/training')) {
    return <TrainingPage />;
  }
  if (route.startsWith('/login') || route.startsWith('/signup')) {
    return <AuthPage />;
  }
  return <LandingPage />;
}

type VizMode = 'legacy' | 'beta';
const VIZ_MODE_KEY = 'noteforge:vizMode';

function readInitialVizMode(): VizMode {
  if (typeof window === 'undefined') return 'beta';
  // URL flag wins — shareable override
  const qs = new URLSearchParams(window.location.search).get('v');
  if (qs === '3d' || window.location.hash.includes('v=3d')) return 'beta';
  if (qs === '2d' || window.location.hash.includes('v=2d')) return 'legacy';
  const stored = window.localStorage.getItem(VIZ_MODE_KEY);
  if (stored === 'legacy' || stored === 'beta') return stored;
  return 'beta';
}

function LandingPage() {
  const session = useAuthStore((s) => s.session);
  const fetchDailyCount = useAuthStore((s) => s.fetchDailyCount);
  const [vizMode, setVizMode] = useState<VizMode>(readInitialVizMode);
  useEffect(() => {
    try { window.localStorage.setItem(VIZ_MODE_KEY, vizMode); } catch { /* noop */ }
  }, [vizMode]);
  const VisualizerComponent = vizMode === 'beta' ? Visualizer3D : Visualizer;

  const [instrument, setInstrument] = useState<InstrumentType>('piano');
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [midi, setMidi] = useState<Midi | null>(null);
  const [isReal, setIsReal] = useState(false);
  const [isCurated, setIsCurated] = useState(false);
  const [isUserMidi, setIsUserMidi] = useState(false);
  const [userMidiName, setUserMidiName] = useState<string | null>(null);
  const [midiUploadError, setMidiUploadError] = useState<string | null>(null);
  const [curatedAttribution, setCuratedAttribution] = useState<string | null>(null);
  const [activeCuratedId, setActiveCuratedId] = useState<string | null>(null);
  const [isDownloadable, setIsDownloadable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Decoding audio');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
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
    setIsCurated(false);
    setIsUserMidi(false);
    setUserMidiName(null);
    setMidiUploadError(null);
    setCuratedAttribution(null);
    setActiveCuratedId(null);
    setIsDownloadable(true);
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
        accessToken: session?.access_token,
        onProgress: (p, s) => {
          setProgress(p);
          setStage(s);
        },
      });
      setMidi(result.midi);
      setIsReal(result.real);
      setIsCurated(false);
      setIsUserMidi(false);
      setUserMidiName(null);
      setMidiUploadError(null);
      setCuratedAttribution(null);
      setActiveCuratedId(null);
      setIsDownloadable(true);
      if (result.real) void fetchDailyCount();
      audioEngine.setBpm(result.bpm);
      audioEngine.loadMidi(result.midi, instrument);
      // When the backend returns real MIDI and we have an original file,
      // default to A/B so the user hears original + synth side by side.
      // Otherwise (mock fallback path) synth-only.
      audioEngine.setSource(result.real ? 'both' : 'synth');
      audioEngine.restart();
      await new Promise((r) => setTimeout(r, 350));
      setOverlayOpen(false);
      setTimeout(() => scrollTo(visualizerRef.current), 250);
    } catch (e) {
      setOverlayOpen(false);
      if (e instanceof TranscriptionLimitError) {
        setLimitReached(true);
      } else {
        console.error(e);
      }
    } finally {
      setBusy(false);
    }
  }, [buffer, fetchDailyCount, file, instrument, session]);

  const handleUploadMidi = useCallback(async (file: File) => {
    if (!session) {
      navigate('/login');
      return;
    }
    setMidiUploadError(null);
    setBusy(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadedMidi = new Midi(arrayBuffer);
      const bpm = loadedMidi.header.tempos[0]?.bpm ?? 120;
      await audioEngine.loadInstruments();
      audioEngine.setBpm(bpm);
      audioEngine.loadMidi(loadedMidi, instrument);
      audioEngine.setSource('synth');
      audioEngine.restart();
      setMidi(loadedMidi);
      setIsReal(true);
      setIsCurated(false);
      setIsUserMidi(true);
      setUserMidiName(file.name);
      setIsDownloadable(true);
      setFile(null);
      setBuffer(null);
      setCuratedAttribution(null);
      setActiveCuratedId(null);
      setTimeout(() => scrollTo(visualizerRef.current), 250);
    } catch {
      setMidiUploadError('Could not read that MIDI file. Make sure it is a valid .mid or .midi.');
    } finally {
      setBusy(false);
    }
  }, [instrument, session]);

  const handleSelectCurated = useCallback(async (song: CuratedMidi) => {
    if (!session) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setOverlayOpen(true);
    setProgress(0);
    setStage('Loading curated MIDI');
    try {
      setFile(null);
      setBuffer(null);
      audioEngine.stop();
      audioEngine.setSource('synth');

      await audioEngine.loadInstruments();
      setProgress(30);
      setStage('Fetching MIDI file');

      const { data, error } = await supabase.storage.from('midi-files').download(song.filename);
      if (error) throw error;
      if (!data) throw new Error('No data received from storage');
      const arrayBuffer = await data.arrayBuffer();

      setProgress(70);
      setStage('Decoding MIDI track');
      const loadedMidi = new Midi(arrayBuffer);

      const bpm = loadedMidi.header.tempos[0]?.bpm ?? 120;
      audioEngine.setBpm(bpm);
      audioEngine.loadMidi(loadedMidi, instrument);

      setMidi(loadedMidi);
      setIsReal(true);
      setIsCurated(true);
      setIsUserMidi(false);
      setUserMidiName(null);
      setMidiUploadError(null);
      setCuratedAttribution(song.attribution);
      setActiveCuratedId(song.id);
      setIsDownloadable(false);

      audioEngine.restart();
      setProgress(100);
      await new Promise((r) => setTimeout(r, 200));
      setOverlayOpen(false);
      setTimeout(() => scrollTo(visualizerRef.current), 250);
    } catch (e) {
      setOverlayOpen(false);
      console.error('Failed to load curated MIDI:', e);
    } finally {
      setBusy(false);
    }
  }, [instrument, session]);

  return (
    <>
      <header className="fixed top-0 right-0 z-50 p-4">
        <AuthBadge />
      </header>
      <main className="relative min-h-screen">
        <Hero onCtaClick={() => scrollTo(uploadRef.current)} />

        <div ref={uploadRef}>
          <UploadZone
            instrument={instrument}
            onInstrumentChange={handleInstrumentChange}
            onFileReady={handleFileReady}
            decode={decodeAudioFile}
            onTranscribe={handleTranscribe}
            onTranscribeGate={() => navigate('/login')}
            audioBuffer={buffer}
            fileName={file?.name ?? null}
            busy={busy}
            curatedMidis={curatedMidis}
            onSelectCurated={handleSelectCurated}
            activeCuratedId={activeCuratedId}
            onMidiUpload={handleUploadMidi}
            midiError={midiUploadError}
          />
        </div>

        <div ref={visualizerRef} className="py-10 md:py-16">
          <div className="px-4 md:px-10 mb-4 flex justify-end">
            <VizModeToggle value={vizMode} onChange={setVizMode} />
          </div>
          {midi ? (
            <VisualizerComponent
              midi={midi}
              instrument={instrument}
              fileName={
                file?.name
                  ?? (isUserMidi ? userMidiName : null)
                  ?? (curatedMidis.find(s => s.id === activeCuratedId)?.title ?? 'Demo · Mock MIDI')
              }
              isRealTranscription={isReal}
              isCurated={isCurated}
              curatedAttribution={curatedAttribution}
              isDownloadable={isDownloadable}
            />
          ) : (
            <div className="text-center text-muted font-mono text-sm py-20">
              Loading demo…
            </div>
          )}
        </div>

        <Footer />

        <ProcessingOverlay open={overlayOpen} progress={progress} stage={stage} instrument={instrument} />
        <LimitReachedDialog open={limitReached} onClose={() => setLimitReached(false)} />
      </main>
    </>
  );
}
