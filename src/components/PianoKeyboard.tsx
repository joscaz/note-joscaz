import { useEffect, useRef } from 'react';
import {
  buildKeyLayout,
  isCKey,
  midiToNoteName,
  MIDI_LOW,
  MIDI_HIGH,
  type KeyRect,
} from '../utils/musicTheory';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';

interface PianoKeyboardProps {
  instrument: InstrumentType;
  /** Ref that the parent updates every frame with currently-sounding midis. */
  activeNotesRef: React.RefObject<Set<number>>;
  height?: number;
}

export function PianoKeyboard({ instrument, activeNotesRef, height = 200 }: PianoKeyboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<KeyRect[]>([]);
  const sizeRef = useRef({ w: 0, h: height });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, rect.width);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutRef.current = buildKeyLayout(w);
      sizeRef.current = { w, h: height };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let rafId = 0;
    const draw = () => {
      const { w, h } = sizeRef.current;
      const layout = layoutRef.current;
      const active = activeNotesRef.current ?? new Set<number>();
      const grad = NOTE_GRADIENTS[instrument];

      ctx.clearRect(0, 0, w, h);

      // Background shelf gradient.
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0a16');
      bg.addColorStop(1, '#050510');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Top divider line (hit line continuation).
      const hit = ctx.createLinearGradient(0, 0, w, 0);
      hit.addColorStop(0, 'rgba(255,255,255,0)');
      hit.addColorStop(0.5, grad.top);
      hit.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hit;
      ctx.fillRect(0, 0, w, 2);
      ctx.shadowColor = grad.glow;
      ctx.shadowBlur = 18;
      ctx.fillRect(0, 0, w, 2);
      ctx.shadowBlur = 0;

      // ----- White keys first -----
      for (const k of layout) {
        if (k.isBlack) continue;
        drawWhiteKey(ctx, k, h, active.has(k.midi), grad);
      }

      // Labels on C keys only.
      ctx.font = '10px "Space Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      for (const k of layout) {
        if (k.isBlack) continue;
        if (!isCKey(k.midi)) continue;
        ctx.fillText(midiToNoteName(k.midi), k.x + k.width / 2, h - 10);
      }

      // ----- Black keys on top -----
      for (const k of layout) {
        if (!k.isBlack) continue;
        drawBlackKey(ctx, k, h, active.has(k.midi), grad);
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [instrument, height, activeNotesRef]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} aria-label={`${instrument} keyboard (${MIDI_LOW}..${MIDI_HIGH})`} />
    </div>
  );
}

function drawWhiteKey(
  ctx: CanvasRenderingContext2D,
  k: KeyRect,
  h: number,
  pressed: boolean,
  grad: { top: string; bottom: string; glow: string },
) {
  const inset = 1;
  const x = k.x + inset;
  const w = k.width - inset * 2;
  const r = 4;
  const y = 4;
  const keyH = h - 6;

  // Body gradient
  const g = ctx.createLinearGradient(x, y, x, y + keyH);
  if (pressed) {
    g.addColorStop(0, grad.top);
    g.addColorStop(0.5, grad.bottom);
    g.addColorStop(1, '#111');
  } else {
    g.addColorStop(0, '#f4f4ff');
    g.addColorStop(0.7, '#d6d6e4');
    g.addColorStop(1, '#a3a3c1');
  }

  roundRect(ctx, x, y, w, keyH, r);
  ctx.fillStyle = g;
  if (pressed) {
    ctx.shadowColor = grad.glow;
    ctx.shadowBlur = 20;
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  // Inner highlight
  ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Side shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + w - 1, y, 1, keyH);
}

function drawBlackKey(
  ctx: CanvasRenderingContext2D,
  k: KeyRect,
  h: number,
  pressed: boolean,
  grad: { top: string; bottom: string; glow: string },
) {
  const keyH = (h - 6) * 0.62;
  const x = k.x;
  const y = 4;
  const w = k.width;
  const r = 3;

  const g = ctx.createLinearGradient(x, y, x, y + keyH);
  if (pressed) {
    g.addColorStop(0, grad.top);
    g.addColorStop(1, grad.bottom);
  } else {
    g.addColorStop(0, '#222232');
    g.addColorStop(0.5, '#0d0d18');
    g.addColorStop(1, '#05050a');
  }

  roundRect(ctx, x, y, w, keyH, r);
  ctx.fillStyle = g;
  if (pressed) {
    ctx.shadowColor = grad.glow;
    ctx.shadowBlur = 18;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Subtle top sheen
  ctx.fillStyle = pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.06)';
  ctx.fillRect(x + 2, y + 2, w - 4, 2);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
