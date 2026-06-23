import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Midi } from '@tonejs/midi';
import { UploadZone } from './UploadZone';
import { CuratedLibrary } from './CuratedLibrary';
import { ProcessingOverlay } from './ProcessingOverlay';
import { Visualizer } from './Visualizer';
import { Visualizer3D } from './Visualizer3D';
import { Footer } from './Footer';
import { AuthBadge } from './AuthBadge';
import { LimitReachedDialog } from './LimitReachedDialog';
import { navigate } from '../hooks/useHashRoute';
import { decodeAudioFile } from '../services/audioDecoder';
import { transcribe, TranscriptionLimitError } from '../services/transcriptionService';
import { audioEngine } from '../services/audioEngine';
import { useAuthStore } from '../services/authStore';
import { generateMockMidi } from '../utils/mockMidi';
import type { InstrumentType } from '../utils/noteColors';
import { curatedMidis } from '../utils/curatedMidis';
import type { CuratedMidi } from '../utils/curatedMidis';
import { supabase } from '../services/supabaseClient';
import { MidiSource } from '../types/midiSource';

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

export function PlayerPage() {
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
  const [midiSource, setMidiSource] = useState<MidiSource>(MidiSource.Demo);
  const [userMidiName, setUserMidiName] = useState<string | null>(null);
  const [midiUploadError, setMidiUploadError] = useState<string | null>(null);
  const [curatedError, setCuratedError] = useState<string | null>(null);
  const [curatedAttribution, setCuratedAttribution] = useState<string | null>(null);
  const [activeCuratedId, setActiveCuratedId] = useState<string | null>(null);
  const [loadingCuratedId, setLoadingCuratedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Decoding audio');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const visualizerRef = useRef<HTMLDivElement>(null);

  // Preload a "demo" MIDI so the visualizer has something to show even before
  // the user uploads — the player route is never empty.
  useEffect(() => {
    let cancelled = false;
    const demo = generateMockMidi('piano');
    void (async () => {
      await audioEngine.loadInstruments();
      if (cancelled) return;
      audioEngine.loadMidi(demo, 'piano');
      audioEngine.setSource('synth');
      setMidi(demo);
      setMidiSource(MidiSource.Demo);
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-dismiss the curated toast so it doesn't linger.
  useEffect(() => {
    if (!curatedError) return;
    const t = setTimeout(() => setCuratedError(null), 5000);
    return () => clearTimeout(t);
  }, [curatedError]);

  const scrollTo = (el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFileReady = useCallback((f: File, buf: AudioBuffer) => {
    setFile(f);
    setBuffer(buf);
    setUserMidiName(null);
    setMidiUploadError(null);
    setCuratedAttribution(null);
    setActiveCuratedId(null);
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
      setMidiSource(MidiSource.Transcribed);
      setUserMidiName(null);
      setMidiUploadError(null);
      setCuratedAttribution(null);
      setActiveCuratedId(null);
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
      setMidiSource(MidiSource.UserMidi);
      setUserMidiName(file.name);
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
  }, [instrument]);

  const handleSelectCurated = useCallback(async (song: CuratedMidi) => {
    setBusy(true);
    setLoadingCuratedId(song.id);
    setCuratedError(null);
    try {
      setFile(null);
      setBuffer(null);
      audioEngine.stop();
      audioEngine.setSource('synth');

      await audioEngine.loadInstruments();

      // Curated files live in a PRIVATE bucket. Ask the edge function for a
      // short-lived signed URL instead of downloading directly — the bucket
      // rejects anonymous reads, which is what stops bulk scraping.
      const { data, error } = await supabase.functions.invoke<{ signedUrl: string }>(
        'get-curated-midi',
        { body: { filename: song.filename } },
      );
      if (error) {
        // supabase-js exposes the raw Response on `context` for HTTP errors.
        const status = (error as { context?: Response }).context?.status;
        if (status === 429) {
          setCuratedError("You're loading songs too fast — wait a moment and try again.");
          return;
        }
        throw error;
      }
      if (!data?.signedUrl) throw new Error('No signed URL received');

      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Failed to fetch MIDI (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();

      const loadedMidi = new Midi(arrayBuffer);

      const bpm = loadedMidi.header.tempos[0]?.bpm ?? 120;
      audioEngine.setBpm(bpm);
      audioEngine.loadMidi(loadedMidi, instrument);

      setMidi(loadedMidi);
      setIsReal(true);
      setMidiSource(MidiSource.Curated);
      setUserMidiName(null);
      setMidiUploadError(null);
      setCuratedAttribution(song.attribution);
      setActiveCuratedId(song.id);

      audioEngine.restart();
      setTimeout(() => scrollTo(visualizerRef.current), 250);
    } catch (e) {
      setCuratedError('Could not load that curated MIDI. Please try again.');
      console.error('Failed to load curated MIDI:', e);
    } finally {
      setBusy(false);
      setLoadingCuratedId(null);
    }
  }, [instrument]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 p-4 flex items-center justify-between">
        <a
          href="#/"
          className="group text-xs font-mono uppercase tracking-[0.25em] text-muted hover:text-text transition-colors flex items-center gap-2"
        >
          <span className="transition-transform group-hover:-translate-x-1">←</span>
          Home
        </a>
        <AuthBadge />
      </header>
      <main className="relative min-h-screen">
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
                  ?? (midiSource === MidiSource.UserMidi ? userMidiName : null)
                  ?? (curatedMidis.find(s => s.id === activeCuratedId)?.title ?? 'Demo · Mock MIDI')
              }
              isRealTranscription={isReal}
              midiSource={midiSource}
              curatedAttribution={curatedAttribution}
            />
          ) : (
            <div className="text-center text-muted font-mono text-sm py-20">
              Loading demo…
            </div>
          )}
        </div>

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
          onMidiUpload={handleUploadMidi}
          midiError={midiUploadError}
        />

        <CuratedLibrary
          curatedMidis={curatedMidis}
          onSelectCurated={handleSelectCurated}
          activeCuratedId={activeCuratedId}
          loadingCuratedId={loadingCuratedId}
          busy={busy}
        />

        <Footer />

        <ProcessingOverlay open={overlayOpen} progress={progress} stage={stage} instrument={instrument} />
        <LimitReachedDialog open={limitReached} onClose={() => setLimitReached(false)} />

        <AnimatePresence>
          {curatedError && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 right-6 z-[60] max-w-[calc(100vw-3rem)] sm:max-w-sm"
              role="status"
              aria-live="polite"
            >
              <div className="glass rounded-2xl border border-pink/20 bg-pink/5 px-5 py-4 flex items-start gap-3 shadow-xl">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-pink shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-text leading-snug">{curatedError}</p>
                <button
                  onClick={() => setCuratedError(null)}
                  className="ml-auto text-muted hover:text-text transition-colors shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
