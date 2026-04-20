import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { InstrumentSelector } from './InstrumentSelector';
import { downsampleWaveform } from '../services/audioDecoder';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';

interface UploadZoneProps {
  instrument: InstrumentType;
  onInstrumentChange: (i: InstrumentType) => void;
  onFileReady: (file: File, buffer: AudioBuffer) => void;
  decode: (f: File) => Promise<AudioBuffer>;
  onTranscribe: () => void;
  audioBuffer: AudioBuffer | null;
  fileName: string | null;
  busy: boolean;
}

export function UploadZone({
  instrument,
  onInstrumentChange,
  onFileReady,
  decode,
  onTranscribe,
  audioBuffer,
  fileName,
  busy,
}: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
              {decoding ? 'Decoding…' : fileName ? 'File loaded — drop another to replace' : 'Drag & drop audio here'}
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
              <button
                onClick={onTranscribe}
                disabled={busy}
                className="relative px-6 py-3 rounded-full font-button font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${grad.top}, ${grad.bottom})`,
                  boxShadow: `0 0 28px ${grad.glow}`,
                }}
              >
                Transcribe →
              </button>
            </div>
            <Waveform buffer={audioBuffer} color={grad.top} />
          </div>
        )}
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
