import { useEffect, useRef, type ReactNode } from 'react';

interface MidiBackgroundProps {
  children?: ReactNode;
  className?: string;
}

// 5 octaves × 12 chromatic pitches.
const LANES = 60;
const TARGET_NOTES = 60;

// Pitch-class → vivid RGB. Index 0 = C.
const PITCH_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 220, 255],   // C   cyan
  [60, 140, 255],  // C#  blue
  [180, 80, 255],  // D   violet
  [255, 60, 200],  // D#  magenta
  [255, 80, 100],  // E   red
  [255, 160, 40],  // F   amber
  [200, 255, 60],  // F#  lime
  [60, 255, 160],  // G   green
  [40, 220, 220],  // G#  teal
  [100, 120, 255], // A   periwinkle
  [255, 100, 220], // A#  pink
  [255, 120, 60],  // B   orange
];

// Pentatonic bias on C D E G A.
const PITCH_WEIGHTS = [3, 1, 3, 1, 3, 1, 1, 3, 1, 3, 1, 1];
const PITCH_WEIGHT_TOTAL = PITCH_WEIGHTS.reduce((a, b) => a + b, 0);

// Three depth layers — wider contrast so foreground/background read clearly.
// `saturation` pulls far-note color toward the cool tint (atmospheric haze).
// `perspective` pulls x toward the horizontal center (vanishing point).
const DEPTHS = [
  { factor: 0.28, speed: 0.55, alpha: 0.55, saturation: 0.45, perspective: 0.32 }, // far
  { factor: 0.7,  speed: 1.45, alpha: 0.9,  saturation: 0.85, perspective: 0.14 }, // mid
  { factor: 1.25, speed: 2.8,  alpha: 1.0,  saturation: 1.0,  perspective: 0.0  }, // near
] as const;

// Cool-blue haze that far notes blend toward, simulating aerial perspective.
const COOL_TINT: readonly [number, number, number] = [28, 36, 70];

function pickPitch(): number {
  let r = Math.random() * PITCH_WEIGHT_TOTAL;
  for (let i = 0; i < 12; i++) {
    r -= PITCH_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

interface Note {
  lane: number;
  color: readonly [number, number, number];
  y: number;
  height: number;
  speed: number;
  depth: 0 | 1 | 2;
  alpha: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: readonly [number, number, number];
}

interface Streak {
  y: number;
  life: number;
  color: readonly [number, number, number];
}

export function MidiBackground({ children, className = '' }: MidiBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const grainRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const main = mainRef.current;
    const grain = grainRef.current;
    if (!container || !main || !grain) return;
    const ctx = main.getContext('2d');
    const gctx = grain.getContext('2d');
    if (!ctx || !gctx) return;

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let w = 0;
    let h = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let laneW = 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      main.width = Math.max(1, Math.floor(w * dpr));
      main.height = Math.max(1, Math.floor(h * dpr));
      main.style.width = `${w}px`;
      main.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      laneW = w / LANES;

      // Grain at half resolution — cheap to refresh, scaled up by CSS.
      const gw = Math.max(1, Math.floor(w / 2));
      const gh = Math.max(1, Math.floor(h / 2));
      grain.width = gw;
      grain.height = gh;
      grain.style.width = `${w}px`;
      grain.style.height = `${h}px`;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const notes: Note[] = [];
    const dust: Dust[] = [];
    const streaks: Streak[] = [];

    // Minimum vertical separation between two notes in the same lane. Prevents
    // same-pitch/same-depth notes from spawning visually packed together
    // (they share color and saturation, so any overlap reads as one blob).
    const MIN_LANE_GAP = 240;

    const spawnNote = (seed = false): boolean => {
      for (let tries = 0; tries < 8; tries++) {
        const pitch = pickPitch();
        const octave = Math.floor(Math.random() * 5);
        const lane = octave * 12 + pitch;
        const dr = Math.random();
        // 42% far, 36% mid, 22% near — more "distance" in the scene.
        const depth: 0 | 1 | 2 = dr < 0.42 ? 0 : dr < 0.78 ? 1 : 2;
        const d = DEPTHS[depth];
        const height = (34 + Math.random() * 82) * (0.4 + d.factor * 0.75);
        const y = seed
          ? Math.random() * (h + 200) - 200
          : -height - Math.random() * 80;

        // Reject if an existing note is in the same lane within MIN_LANE_GAP.
        let collision = false;
        for (const n of notes) {
          if (n.lane === lane && Math.abs(n.y - y) < MIN_LANE_GAP) {
            collision = true;
            break;
          }
        }
        if (collision) continue;

        const [pr, pg, pb] = PITCH_COLORS[pitch];
        const s = d.saturation;
        const color: readonly [number, number, number] = [
          Math.round(pr * s + COOL_TINT[0] * (1 - s)),
          Math.round(pg * s + COOL_TINT[1] * (1 - s)),
          Math.round(pb * s + COOL_TINT[2] * (1 - s)),
        ];
        notes.push({ lane, color, y, height, speed: d.speed, depth, alpha: d.alpha });
        return true;
      }
      // All retries collided — skip this spawn rather than force a pack.
      return false;
    };

    for (let i = 0; i < TARGET_NOTES; i++) spawnNote(true);

    for (let i = 0; i < 80; i++) {
      dust.push({
        x: Math.random() * Math.max(w, 1),
        y: Math.random() * Math.max(h, 1),
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.1 + Math.random() * 0.3),
        r: 0.5 + Math.random() * 1.5,
        color: PITCH_COLORS[Math.floor(Math.random() * 12)],
      });
    }

    let frame = 0;
    let rafId = 0;
    let running = true;

    const render = () => {
      frame++;

      // Motion trail — smear persistence instead of clearing.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(6, 7, 14, 0.13)';
      ctx.fillRect(0, 0, w, h);

      // Rhythmic burst every ~24 frames, plus top-up to TARGET_NOTES.
      // spawnNote() may skip when all 60 lanes would collide — cap attempts
      // so we never infinite-loop waiting for a free slot.
      if (frame % 24 === 0) {
        const burst = 6 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burst; i++) spawnNote();
      }
      for (let safety = 0; safety < 24 && notes.length < TARGET_NOTES; safety++) {
        if (!spawnNote()) break;
      }

      // Update positions & cull dead notes.
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.y += n.speed;
        if (n.y - 40 > h) notes.splice(i, 1);
      }

      // Compute the final rectangle for a note, including perspective
      // compression toward horizontal center (vanishing-point illusion).
      const rectX = (n: Note, noteW: number): number => {
        const d = DEPTHS[n.depth];
        const basicCenter = n.lane * laneW + laneW / 2;
        const cx = basicCenter + (w / 2 - basicCenter) * d.perspective;
        return cx - noteW / 2;
      };
      const rectW = (n: Note): number => {
        // Near notes can slightly overflow their lane; far notes sit thin.
        return laneW * (0.32 + DEPTHS[n.depth].factor * 0.58);
      };

      // Draw by depth: far → mid → near, so closer notes always occlude.
      for (let layer = 0 as 0 | 1 | 2; layer <= 2; layer = (layer + 1) as 0 | 1 | 2) {
        for (const n of notes) {
          if (n.depth !== layer) continue;
          const d = DEPTHS[layer];
          const noteW = rectW(n);
          const x = rectX(n, noteW);
          const y = n.y;
          const hN = n.height;
          const [r, g, b] = n.color;
          const rgb = `${r}, ${g}, ${b}`;
          const dim = `${Math.floor(r * 0.35)}, ${Math.floor(g * 0.35)}, ${Math.floor(b * 0.35)}`;

          // 1. Outer bloom halo.
          ctx.globalAlpha = 0.12 * n.alpha;
          ctx.shadowColor = `rgb(${rgb})`;
          ctx.shadowBlur = 90 * d.factor;
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.fillRect(x, y, noteW, hN);

          // 2. Inner glow.
          ctx.globalAlpha = 0.38 * n.alpha;
          ctx.shadowBlur = 32 * d.factor;
          ctx.fillRect(x, y, noteW, hN);

          // 3. Core body — vertical gradient, bright top → dim bottom.
          ctx.globalAlpha = n.alpha;
          ctx.shadowBlur = 0;
          const grad = ctx.createLinearGradient(x, y, x, y + hN);
          grad.addColorStop(0, `rgba(${rgb}, 1)`);
          grad.addColorStop(1, `rgba(${dim}, 1)`);
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, noteW, hN);

          // 4. Specular — top edge highlight + right-edge shine.
          // Scale specular intensity with depth so far notes read matte.
          const specA = 0.35 + 0.5 * d.factor;
          ctx.fillStyle = `rgba(255,255,255,${specA})`;
          ctx.fillRect(x, y, noteW, Math.max(1, hN * 0.04));
          const shineW = Math.min(3, noteW * 0.25);
          const shine = ctx.createLinearGradient(x + noteW - shineW, 0, x + noteW, 0);
          shine.addColorStop(0, 'rgba(255,255,255,0)');
          shine.addColorStop(1, `rgba(255,255,255,${0.2 + 0.3 * d.factor})`);
          ctx.fillStyle = shine;
          ctx.fillRect(x + noteW - shineW, y, shineW, hN);
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Chromatic aberration — every 3rd frame: red -2px, blue +2px, screen blend.
      if (frame % 3 === 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.028;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgb(255,0,0)';
        for (const n of notes) {
          const noteW = rectW(n);
          ctx.fillRect(rectX(n, noteW) - 2, n.y, noteW, n.height);
        }
        ctx.fillStyle = 'rgb(0,0,255)';
        for (const n of notes) {
          const noteW = rectW(n);
          ctx.fillRect(rectX(n, noteW) + 2, n.y, noteW, n.height);
        }
        ctx.restore();
      }

      // Dust — tiny chromatic dots drifting upward with subtle glow.
      for (const p of dust) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        else if (p.x > w + 4) p.x = -4;
        const [r, g, b] = p.color;
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Occasional horizontal light streaks, 125-frame life.
      if (Math.random() < 0.004) {
        streaks.push({
          y: Math.random() * h,
          life: 125,
          color: PITCH_COLORS[Math.floor(Math.random() * 12)],
        });
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.life -= 1;
        if (s.life <= 0) {
          streaks.splice(i, 1);
          continue;
        }
        const t = s.life / 125;
        const [r, g, b] = s.color;
        const rgb = `${r}, ${g}, ${b}`;
        const lg = ctx.createLinearGradient(0, s.y, w, s.y);
        lg.addColorStop(0, `rgba(${rgb}, 0)`);
        lg.addColorStop(0.5, `rgba(${rgb}, ${0.35 * t})`);
        lg.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.shadowColor = `rgb(${rgb})`;
        ctx.shadowBlur = 18 * t;
        ctx.fillStyle = lg;
        ctx.fillRect(0, s.y - 0.75, w, 1.5);
      }
      ctx.shadowBlur = 0;

      // Film grain — refresh every 2 frames.
      if (frame % 2 === 0) {
        const gw = grain.width;
        const gh = grain.height;
        const img = gctx.createImageData(gw, gh);
        const data = img.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 18;
        }
        gctx.putImageData(img, 0, 0);
      }

      if (running) rafId = requestAnimationFrame(render);
    };

    if (prefersReduced) {
      render();
    } else {
      rafId = requestAnimationFrame(render);
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!prefersReduced) {
        running = true;
        rafId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ background: '#06070e' }}
    >
      <canvas ref={mainRef} className="absolute inset-0 pointer-events-none" aria-hidden />
      <canvas
        ref={grainRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen', opacity: 0.6 }}
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.8) 0px, rgba(0,0,0,0.8) 1px, transparent 1px, transparent 4px)',
          opacity: 0.06,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 100%)',
        }}
      />
      {children}
    </div>
  );
}
