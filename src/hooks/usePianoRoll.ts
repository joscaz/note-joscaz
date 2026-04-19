import * as Tone from 'tone';
import {
  buildKeyLayout,
  type KeyRect,
  MIDI_HIGH,
  MIDI_LOW,
} from '../utils/musicTheory';
import { NOTE_GRADIENTS, velocityToOpacity, type InstrumentType } from '../utils/noteColors';
import type { NoteEvent } from '../services/audioEngine';

export interface PianoRollOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  notesRef: React.RefObject<readonly NoteEvent[]>;
  instrumentRef: React.RefObject<InstrumentType>;
  scrollSpeedRef: React.RefObject<number>; // px/s
  activeNotesRef: React.RefObject<Set<number>>;
  bpmRef: React.RefObject<number>;
}

/**
 * Render-loop controller for the falling-notes canvas.
 *
 * Crucially, the y-position of each note is derived from Tone.Transport.seconds
 * *directly*, NOT from an accumulated delta. That is what keeps the visuals
 * frame-perfect in sync with the audio engine (which schedules note triggers
 * on the same Transport clock).
 */
export function startPianoRoll(opts: PianoRollOptions): () => void {
  const { canvas, container, notesRef, instrumentRef, scrollSpeedRef, activeNotesRef, bpmRef } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  let width = 0;
  let height = 0;
  let layout: KeyRect[] = [];
  const dprCap = 2;

  const particles: Particle[] = [];
  const maxParticles = 240;
  const spawnedForNote = new Set<string>();

  const resize = () => {
    const rect = container.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(240, rect.height);
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = buildKeyLayout(width);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const hitLineRatio = 0.94;

  let rafId = 0;
  let lastT = Tone.getTransport().seconds;

  const render = () => {
    const t = Tone.getTransport().seconds;
    const dt = Math.max(0, t - lastT);
    lastT = t;

    const instrument = instrumentRef.current ?? 'piano';
    const grad = NOTE_GRADIENTS[instrument];
    const scrollSpeed = scrollSpeedRef.current ?? 200;
    const notes = notesRef.current ?? [];
    const hitLineY = height * hitLineRatio;
    const bpm = bpmRef.current ?? 120;
    const secPerBeat = 60 / bpm;

    // --- background ---
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#05050c');
    bg.addColorStop(1, '#0a0a18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // --- beat/bar grid ---
    const lookAheadSec = hitLineY / scrollSpeed;
    const firstBeat = Math.floor(t / secPerBeat);
    const lastBeat = Math.ceil((t + lookAheadSec) / secPerBeat);
    for (let b = firstBeat; b <= lastBeat; b++) {
      const beatTime = b * secPerBeat;
      const y = hitLineY - (beatTime - t) * scrollSpeed;
      if (y < 0 || y > height) continue;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (isBar) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '10px "Space Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.floor(b / 4) + 1}`, 8, y - 4);
      }
    }

    // --- vertical key column hints ---
    ctx.globalAlpha = 0.04;
    for (const k of layout) {
      if (k.isBlack) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(k.x + 0.5, 0, k.width - 1, height);
    }
    ctx.globalAlpha = 1;

    // --- falling notes ---
    // Cull notes outside the visible time window.
    const windowStart = t - 2; // keep drawing for 2s past the hit line so there's a trail
    const windowEnd = t + lookAheadSec + 0.5;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const noteEnd = n.time + n.duration;
      if (noteEnd < windowStart) continue;
      if (n.time > windowEnd) break;
      if (n.midi < MIDI_LOW || n.midi > MIDI_HIGH) continue;
      const rect = layout[n.midi - MIDI_LOW];
      if (!rect) continue;

      const topY = hitLineY - (noteEnd - t) * scrollSpeed;
      const bottomY = hitLineY - (n.time - t) * scrollSpeed;
      const h = Math.max(6, bottomY - topY);

      const opacity = velocityToOpacity(n.velocity);

      // Hit-line proximity glow intensity
      const distance = Math.abs(bottomY - hitLineY);
      const proximity = Math.max(0, 1 - distance / 80);

      const w = rect.width - (rect.isBlack ? 2 : 3);
      const x = rect.x + (rect.isBlack ? 1 : 1.5);
      const y = topY;

      // gradient body
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, grad.top);
      g.addColorStop(1, grad.bottom);
      ctx.globalAlpha = opacity;

      roundRect(ctx, x, y, w, h, Math.min(6, w / 2.5));
      ctx.fillStyle = g;
      if (proximity > 0.1) {
        ctx.shadowColor = grad.glow;
        ctx.shadowBlur = 8 + proximity * 28;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner shimmer line
      ctx.globalAlpha = opacity * 0.75;
      const shimmer = ctx.createLinearGradient(x, 0, x + w, 0);
      shimmer.addColorStop(0, 'rgba(255,255,255,0)');
      shimmer.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      shimmer.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimmer;
      ctx.fillRect(x + 1, y + 2, w - 2, 1.5);

      // Border highlight
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spawn particles once per note crossing the hit line.
      const key = `${n.midi}:${n.time.toFixed(4)}`;
      if (!spawnedForNote.has(key) && bottomY >= hitLineY && bottomY < hitLineY + scrollSpeed * dt + 4) {
        spawnParticles(particles, x + w / 2, hitLineY, grad.top, grad.bottom, n.velocity);
        spawnedForNote.add(key);
        if (spawnedForNote.size > 4000) {
          // Prune old keys periodically so the Set doesn't grow unbounded.
          const toDrop = spawnedForNote.size - 2000;
          let i2 = 0;
          for (const k2 of spawnedForNote) {
            spawnedForNote.delete(k2);
            if (++i2 >= toDrop) break;
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt; // gravity-ish
      const a = Math.max(0, p.life / p.total);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (particles.length > maxParticles) particles.splice(0, particles.length - maxParticles);

    // --- active note highlight bloom on hit line ---
    const active = activeNotesRef.current;
    if (active && active.size > 0) {
      for (const midi of active) {
        if (midi < MIDI_LOW || midi > MIDI_HIGH) continue;
        const rect = layout[midi - MIDI_LOW];
        if (!rect) continue;
        const cx = rect.x + rect.width / 2;
        const glowGrad = ctx.createRadialGradient(cx, hitLineY, 0, cx, hitLineY, 60);
        glowGrad.addColorStop(0, grad.glow);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(cx - 60, hitLineY - 40, 120, 60);
      }
    }

    // --- hit line ---
    ctx.strokeStyle = grad.top;
    ctx.lineWidth = 2;
    ctx.shadowColor = grad.glow;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(0, hitLineY);
    ctx.lineTo(width, hitLineY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    rafId = requestAnimationFrame(render);
  };
  rafId = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
  };
}

/* ------------------------------- Particles ------------------------------- */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  total: number;
}

function spawnParticles(
  pool: Particle[],
  x: number,
  y: number,
  top: string,
  bottom: string,
  velocity: number,
) {
  const count = 6 + Math.floor(velocity * 8);
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = 120 + Math.random() * 220 * (0.5 + velocity);
    pool.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1.2 + Math.random() * 2.4,
      color: Math.random() > 0.5 ? top : bottom,
      life: 0.4 + Math.random() * 0.4,
      total: 0.8,
    });
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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
