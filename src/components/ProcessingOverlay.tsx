import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { getPipelineStages } from '../services/transcriptionService';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';

interface ProcessingOverlayProps {
  open: boolean;
  progress: number; // 0..1
  stage: string;
  instrument: InstrumentType;
}

export function ProcessingOverlay({ open, progress, stage, instrument }: ProcessingOverlayProps) {
  const stages = getPipelineStages();
  const grad = NOTE_GRADIENTS[instrument];
  const activeIdx = Math.min(stages.length - 1, Math.floor(progress * stages.length));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <div className="relative max-w-3xl w-[92%] glass rounded-3xl border border-white/10 p-8 md:p-12 flex flex-col gap-8">
            <div className="text-center space-y-2">
              <div className="text-xs uppercase tracking-[0.5em] text-muted font-mono">Transcribing</div>
              <div className="font-display text-3xl md:text-4xl font-extrabold text-shimmer">{stage}</div>
            </div>

            <StageAnimation index={activeIdx} grad={grad} />

            <div className="grid grid-cols-4 gap-3">
              {stages.map((s, i) => {
                const done = i < activeIdx;
                const active = i === activeIdx;
                return (
                  <div
                    key={s}
                    className="rounded-xl border p-3 text-center transition-all"
                    style={{
                      borderColor: active ? grad.top : done ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                      background: active ? `${grad.top}14` : 'transparent',
                      boxShadow: active ? `0 0 18px ${grad.glow}` : 'none',
                    }}
                  >
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">0{i + 1}</div>
                    <div className={`mt-1 text-xs font-medium ${active ? 'text-text' : done ? 'text-muted' : 'text-muted/60'}`}>
                      {s}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${grad.top}, ${grad.bottom})`,
                  boxShadow: `0 0 12px ${grad.glow}`,
                }}
                animate={{ width: `${Math.min(100, progress * 100)}%` }}
                transition={{ ease: 'easeInOut', duration: 0.3 }}
              />
            </div>
            <div className="text-center font-mono text-xs text-muted tabular-nums">
              {Math.round(progress * 100)}%
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A per-stage canvas animation: waveform, strike lines, velocity bars, mini roll. */
function StageAnimation({
  index,
  grad,
}: {
  index: number;
  grad: { top: string; bottom: string; glow: string };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const w = c.clientWidth;
      const h = 140;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const w = c.clientWidth;
      const h = 140;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(10,10,20,0.6)';
      ctx.fillRect(0, 0, w, h);

      if (index === 0) drawWaveform(ctx, w, h, t, grad);
      else if (index === 1) drawOnsets(ctx, w, h, t, grad);
      else if (index === 2) drawVelocities(ctx, w, h, t, grad);
      else drawMiniRoll(ctx, w, h, t, grad);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [index, grad]);

  return <canvas ref={ref} className="w-full rounded-xl border border-white/5" />;
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  grad: { top: string; glow: string },
) {
  ctx.strokeStyle = grad.top;
  ctx.lineWidth = 2;
  ctx.shadowColor = grad.glow;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const p = x / w;
    const y =
      h / 2 +
      Math.sin(p * 28 + t * 4) * 22 * (0.4 + 0.6 * Math.sin(p * 3 + t * 1.2)) +
      Math.sin(p * 90 + t * 8) * 6;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawOnsets(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  grad: { top: string; bottom: string; glow: string },
) {
  drawWaveform(ctx, w, h, t, grad);
  // Vertical strike lines flashing on beat.
  const beats = 12;
  for (let i = 0; i < beats; i++) {
    const x = (i + ((t * 2) % 1)) * (w / beats);
    const alpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 6 + i));
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = grad.glow;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, h - 8);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawVelocities(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  grad: { top: string; bottom: string },
) {
  const bars = 36;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const v = Math.abs(Math.sin(i * 0.7 + t * 2)) * 0.9;
    const bh = 20 + v * (h - 40);
    const x = i * bw + 2;
    const y = h - bh - 10;
    const g = ctx.createLinearGradient(x, y, x, y + bh);
    g.addColorStop(0, grad.top);
    g.addColorStop(1, grad.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw - 4, bh);
  }
}

function drawMiniRoll(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  grad: { top: string; bottom: string; glow: string },
) {
  const rows = 8;
  const rh = h / rows;
  // Background rows
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, r * rh, w, rh);
  }
  // Scrolling notes
  const notes = [
    [0, 0.0, 0.15], [2, 0.1, 0.12], [4, 0.2, 0.18], [1, 0.34, 0.14],
    [3, 0.5, 0.20], [5, 0.62, 0.12], [2, 0.75, 0.22], [6, 0.88, 0.14],
  ];
  const scroll = (t * 0.18) % 1;
  for (const [row, st, dur] of notes) {
    const x = ((st - scroll + 1) % 1) * w;
    const width = dur * w;
    const y = row * rh + 4;
    const g = ctx.createLinearGradient(x, y, x + width, y);
    g.addColorStop(0, grad.top);
    g.addColorStop(1, grad.bottom);
    ctx.fillStyle = g;
    ctx.shadowColor = grad.glow;
    ctx.shadowBlur = 10;
    roundRect(ctx, x, y, width, rh - 8, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
