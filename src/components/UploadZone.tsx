import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { InstrumentSelector } from './InstrumentSelector';
import { downsampleWaveform } from '../services/audioDecoder';
import { useAuthStore } from '../services/authStore';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';
import type { CuratedMidi } from '../utils/curatedMidis';

interface UploadZoneProps {
  instrument: InstrumentType;
  onInstrumentChange: (i: InstrumentType) => void;
  onFileReady: (file: File, buffer: AudioBuffer) => void;
  decode: (f: File) => Promise<AudioBuffer>;
  onTranscribe: () => void;
  onTranscribeGate?: () => void;
  audioBuffer: AudioBuffer | null;
  fileName: string | null;
  busy: boolean;
  
  curatedMidis: CuratedMidi[];
  onSelectCurated: (song: CuratedMidi) => void;
  activeCuratedId: string | null;
}

const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

export function UploadZone({
  instrument,
  onInstrumentChange,
  onFileReady,
  decode,
  onTranscribe,
  onTranscribeGate,
  audioBuffer,
  fileName,
  busy,
  curatedMidis,
  onSelectCurated,
  activeCuratedId,
}: UploadZoneProps) {
  const user = useAuthStore((s) => s.user);
  const [dragOver, setDragOver] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const grad = NOTE_GRADIENTS[instrument];

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)) {
        setError('Please upload an MP3, WAV, or similar audio file.');
        return;
      }
      setError(null);
      setDecoding(true);
      try {
        const buf = await decode(file);
        onFileReady(file, buf);
      } catch (e) {
        console.error(e);
        setError('Could not decode that file. Try a standard MP3 or WAV.');
      } finally {
        setDecoding(false);
      }
    },
    [decode, onFileReady],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const genres: Array<{ id: string; label: string }> = [
    { id: 'All', label: 'All' },
    { id: 'Classical', label: 'Classical' },
    { id: 'Pop/Modern', label: 'Pop & Modern' },
    { id: 'Game/Anime', label: 'Game & Anime' },
    { id: 'Special', label: 'Special & Fun' },
  ];

  const filteredMidis = curatedMidis.filter((song) => {
    if (selectedGenre === 'All') return true;
    return song.genre === selectedGenre;
  });

  return (
    <section id="upload" className="px-4 md:px-10 py-16 md:py-24 bg-bg">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div className="text-center space-y-3">
          <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">Step 01</div>
          <h2 className="font-display text-4xl md:text-6xl font-extrabold text-text">
            Drop your audio
          </h2>
          <p className="text-muted max-w-xl mx-auto">
            MP3, WAV, or any standard format. Audio is uploaded to the transcription backend and the resulting MIDI is played in your browser.
          </p>
        </div>

        <InstrumentSelector value={instrument} onChange={onInstrumentChange} />

        <motion.label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          htmlFor="file-input"
          className={`relative block rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden p-10 text-center ${
            dragOver ? 'border-white/60 bg-white/[0.04]' : 'border-white/10 hover:border-white/25'
          }`}
          style={{
            boxShadow: dragOver ? `0 0 60px ${grad.glow}` : 'none',
          }}
          animate={{ scale: dragOver ? 1.01 : 1 }}
        >
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? undefined)}
            className="hidden"
          />

          <div className="relative z-10 flex flex-col items-center gap-3">
            <motion.div
              animate={{ y: dragOver ? -4 : 0 }}
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${grad.top}20, ${grad.bottom}20)`,
                border: `1px solid ${grad.top}55`,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={grad.top} strokeWidth="2">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
            <div className="font-display font-bold text-xl">
              {decoding ? 'Decoding…' : fileName ? 'File loaded — drop another to replace' : isTouch ? 'Tap to choose audio' : 'Drag & drop audio here'}
            </div>
            <div className="text-xs font-mono text-muted uppercase tracking-wider">
              or click to browse
            </div>
          </div>
        </motion.label>

        {error && (
          <div className="text-center text-sm text-pink font-mono">{error}</div>
        )}

        {audioBuffer && (
          <div className="glass rounded-2xl border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted">Preview</div>
                <div className="font-display font-bold text-lg truncate max-w-[60vw]">{fileName}</div>
                <div className="text-xs font-mono text-muted">
                  {audioBuffer.duration.toFixed(2)}s · {audioBuffer.numberOfChannels} ch · {audioBuffer.sampleRate / 1000} kHz
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <button
                  onClick={user ? onTranscribe : onTranscribeGate}
                  disabled={busy}
                  className="relative px-6 py-3 rounded-full font-button font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed bg-[#00b4d8]"
                >
                  {user ? 'Transcribe →' : 'Sign in to Transcribe'}
                </button>
              </div>
            </div>
            <Waveform buffer={audioBuffer} color={grad.top} />
          </div>
        )}

        {/* Curated Masterpieces Section */}
        <div className="mt-12 space-y-6">
          <div className="text-center space-y-2">
            <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">Curated Library</div>
            <h3 className="font-display text-2xl md:text-3xl font-extrabold text-text">
              Official MIDI Collection
            </h3>
            <p className="text-muted text-sm max-w-lg mx-auto">
              Play high-fidelity curated MIDI files and custom arrangements directly in the interactive visualizer.
            </p>
          </div>

          {/* Genre Filter Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8 bg-black/10 p-1.5 rounded-full border border-white/5 max-w-fit mx-auto backdrop-blur-sm">
            {genres.map((g) => {
              const count = g.id === 'All'
                ? curatedMidis.length
                : curatedMidis.filter(m => m.genre === g.id).length;

              if (count === 0 && g.id !== 'All') return null;

              const isActive = selectedGenre === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGenre(g.id)}
                  className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white/10 text-text shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/15'
                      : 'border border-transparent text-muted hover:text-text'
                  }`}
                >
                  <span>{g.label}</span>
                  <span className={`text-[10px] opacity-65 px-1 py-0.5 rounded bg-black/40 font-semibold font-sans`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMidis.map((song) => {
              const isActive = activeCuratedId === song.id;
              
              // Difficulty colors
              let diffClass = '';
              if (song.difficulty === 'Intermediate') {
                diffClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
              } else if (song.difficulty === 'Advanced') {
                diffClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
              } else {
                diffClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
              }

              return (
                <button
                  key={song.id}
                  onClick={() => onSelectCurated(song)}
                  disabled={busy}
                  className={`group text-left relative p-5 rounded-2xl border transition-all duration-300 bg-white/[0.02] ${
                    isActive
                      ? 'border-piano-green bg-piano-green/[0.04] shadow-[0_0_30px_rgba(0,180,216,0.15)]'
                      : 'border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {/* Glowing background on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                    style={{
                      background: `radial-gradient(circle 80px at 50% 50%, ${grad.top}08, transparent)`,
                    }}
                  />

                  <div className="flex flex-col h-full justify-between gap-3 relative z-10">
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${diffClass}`}>
                            {song.difficulty}
                          </span>
                          {song.attribution === 'Rousseau' && (
                            <span className="text-[9px] font-mono tracking-wider text-piano-green bg-piano-green/10 border border-piano-green/20 px-2 py-0.5 rounded-full">
                              Rousseau
                            </span>
                          )}
                        </div>
                        {isActive && (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-piano-green opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-piano-green"></span>
                          </span>
                        )}
                      </div>
                      <h4 className="font-display font-bold text-base text-text mt-3 group-hover:text-piano-green transition-colors line-clamp-2">
                        {song.title}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5 text-xs">
                      <span className="text-muted truncate font-medium max-w-[150px]">{song.composer}</span>
                      <span className="text-muted/60 font-mono text-[10px] uppercase flex items-center gap-1 group-hover:text-text transition-colors">
                        Load
                        <svg className="w-3 h-3 transform translate-x-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Waveform({ buffer, color }: { buffer: AudioBuffer; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = container.clientWidth;
      const h = 80;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const peaks = downsampleWaveform(buffer, Math.min(800, Math.floor(w / 2)));
      const mid = h / 2;
      const barW = w / peaks.length;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < peaks.length; i++) {
        const amp = peaks[i] * (h * 0.45);
        ctx.fillRect(i * barW, mid - amp, Math.max(1, barW - 0.5), amp * 2);
      }
      ctx.shadowBlur = 0;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [buffer, color]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={ref} />
    </div>
  );
}
