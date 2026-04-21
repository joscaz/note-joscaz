import { useEffect } from 'react';
import type { Midi } from '@tonejs/midi';
import { downloadMidi } from '../services/midiExporter';
import type { AudioSource } from '../services/audioEngine';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';

interface PlayerApi {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  volume: number;
  loop: boolean;
  source: AudioSource;
  pianoSustain: boolean;
  toggle: () => Promise<void>;
  restart: () => void;
  seek: (s: number) => void;
  seekBy: (d: number) => void;
  setBpm: (b: number) => void;
  setVolume: (v: number) => void;
  setLoop: (l: boolean) => void;
  setSource: (s: AudioSource) => void;
  setPianoSustain: (on: boolean) => void;
}

interface PlaybackControlsProps {
  player: PlayerApi;
  scrollSpeed: number;
  onScrollSpeedChange: (n: number) => void;
  midi: Midi;
  instrument: InstrumentType;
}

export function PlaybackControls({
  player,
  scrollSpeed,
  onScrollSpeedChange,
  midi,
  instrument,
}: PlaybackControlsProps) {
  const grad = NOTE_GRADIENTS[instrument];

  // Keyboard shortcuts: Space = toggle, R = restart, ArrowUp/Down = scroll speed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void player.toggle();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        player.restart();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        onScrollSpeedChange(Math.min(600, scrollSpeed + 20));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        onScrollSpeedChange(Math.max(80, scrollSpeed - 20));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        player.seekBy(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        player.seekBy(5);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [player, scrollSpeed, onScrollSpeedChange]);

  const progress = player.duration > 0 ? player.currentTime / player.duration : 0;

  return (
    <div className="glass rounded-2xl border border-white/10 p-4 md:p-5 flex flex-col gap-4">
      {/* Timeline */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted w-14 tabular-nums">{fmt(player.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, player.duration)}
          step={0.01}
          value={player.currentTime}
          onChange={(e) => player.seek(parseFloat(e.target.value))}
          className="flex-1 accent-[color:var(--accent)]"
          style={{
            ['--accent' as string]: grad.top,
          } as React.CSSProperties}
        />
        <span className="font-mono text-xs text-muted w-14 tabular-nums text-right">{fmt(player.duration)}</span>
      </div>

      {/* Row 1: transport */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ControlButton title="Restart (R)" onClick={player.restart}>⏮</ControlButton>
          <ControlButton title="Back 5s (←)" onClick={() => player.seekBy(-5)}>⏪</ControlButton>
          <PlayButton playing={player.isPlaying} onClick={() => void player.toggle()} grad={grad} />
          <ControlButton title="Forward 5s (→)" onClick={() => player.seekBy(5)}>⏩</ControlButton>
          <ControlButton title="End" onClick={() => player.seek(player.duration)}>⏭</ControlButton>
        </div>

        <div className="h-6 w-px bg-white/10" />

        {/* BPM */}
        <label className="flex items-center gap-2 text-xs font-mono text-muted">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={Math.round(player.bpm)}
            onChange={(e) => player.setBpm(parseInt(e.target.value, 10) || 120)}
            className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-text tabular-nums"
          />
        </label>

        {/* Scroll speed */}
        <label className="flex items-center gap-2 text-xs font-mono text-muted">
          <span>SCROLL</span>
          <input
            type="range"
            min={80}
            max={600}
            step={10}
            value={scrollSpeed}
            onChange={(e) => onScrollSpeedChange(parseInt(e.target.value, 10))}
            className="w-32 accent-[color:var(--accent)]"
            style={{ ['--accent' as string]: grad.top } as React.CSSProperties}
          />
          <span className="tabular-nums w-12 text-text">{scrollSpeed}</span>
        </label>

        <div className="h-6 w-px bg-white/10" />

        {/* Volume */}
        <label className="flex items-center gap-2 text-xs font-mono text-muted">
          <span>VOL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            onChange={(e) => player.setVolume(parseFloat(e.target.value))}
            className="w-32 accent-[color:var(--accent)]"
            style={{ ['--accent' as string]: grad.top } as React.CSSProperties}
            title="Volume"
            aria-label="Volume"
          />
          <span className="tabular-nums w-8 text-text">{Math.round(player.volume * 100)}</span>
        </label>

        <div className="h-6 w-px bg-white/10" />

        {/* Loop */}
        <button
          onClick={() => player.setLoop(!player.loop)}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border transition-colors ${
            player.loop
              ? 'bg-white/10 border-white/30 text-text'
              : 'border-white/10 text-muted hover:text-text hover:border-white/20'
          }`}
          title="Loop (L)"
        >
          Loop
        </button>

        {/* Piano-only: sustain toggle. The transcription model emits only
            onsets, so any "sustain" is synthesized on playback. On = let
            each sample decay naturally (rich, piano-y). Off = cut each note
            at the short UX duration for a staccato / pedal-up feel. */}
        {instrument === 'piano' && (
          <button
            onClick={() => player.setPianoSustain(!player.pianoSustain)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border transition-colors ${
              player.pianoSustain
                ? 'bg-white/10 border-white/30 text-text'
                : 'border-white/10 text-muted hover:text-text hover:border-white/20'
            }`}
            title={
              player.pianoSustain
                ? 'Sustain ON — notes ring out naturally'
                : 'Sustain OFF — staccato / pedal-up'
            }
          >
            Sustain
          </button>
        )}

        {/* A/B source switch */}
        <ABSwitch value={player.source} onChange={player.setSource} color={grad.top} />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => downloadMidi(midi, `notejoscaz-${instrument}.mid`)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border border-white/10 text-muted hover:text-text hover:border-white/30 transition-colors"
          >
            ↓ MIDI
          </button>
        </div>
      </div>

      {/* Progress shimmer under controls */}
      <div className="relative h-0.5 w-full bg-white/5 rounded overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full transition-all"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${grad.top}, ${grad.bottom})`,
            boxShadow: `0 0 12px ${grad.glow}`,
          }}
        />
      </div>
    </div>
  );
}

function PlayButton({ playing, onClick, grad }: { playing: boolean; onClick: () => void; grad: { top: string; bottom: string; glow: string } }) {
  return (
    <button
      onClick={onClick}
      title="Play/Pause (Space)"
      className="relative w-12 h-12 rounded-full flex items-center justify-center text-lg font-button font-bold text-black transition-transform hover:scale-105 active:scale-95"
      style={{
        background: `linear-gradient(135deg, ${grad.top}, ${grad.bottom})`,
        boxShadow: `0 0 22px ${grad.glow}, 0 4px 20px rgba(0,0,0,0.4)`,
      }}
    >
      {playing ? '⏸' : '▶'}
    </button>
  );
}

function ControlButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-lg border border-white/10 text-muted hover:text-text hover:border-white/30 transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function ABSwitch({ value, onChange, color }: { value: AudioSource; onChange: (s: AudioSource) => void; color: string }) {
  const opts: Array<{ id: AudioSource; label: string; hint: string }> = [
    { id: 'mp3', label: 'MP3', hint: 'Original audio' },
    { id: 'both', label: 'A/B', hint: 'Both at once' },
    { id: 'synth', label: 'MIDI', hint: 'Synthesized transcription' },
  ];
  return (
    <div
      className="relative flex items-center bg-black/40 rounded-lg border border-white/10 p-1"
      title="Switch audio source"
    >
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.hint}
          className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded transition-all ${
            value === o.id ? 'text-black' : 'text-muted hover:text-text'
          }`}
          style={
            value === o.id
              ? { background: color, boxShadow: `0 0 10px ${color}` }
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fmt(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
