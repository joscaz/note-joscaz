import { useEffect, useState } from 'react';

/**
 * Full-viewport notice shown on screens narrower than `minWidth`.
 * NoteForge's 88-key piano roll is designed for desktop; rather than render a
 * squished version, we show a cleaner "best on desktop" card.
 */
export function DesktopGate({ minWidth = 900, children }: { minWidth?: number; children: React.ReactNode }) {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= minWidth : true));
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= minWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minWidth]);

  if (wide) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-aurora">
      <div className="glass max-w-md rounded-3xl border border-white/10 p-8 text-center flex flex-col gap-4">
        <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">NoteForge AI</div>
        <h2 className="font-display text-3xl font-extrabold text-shimmer">Best on desktop</h2>
        <p className="text-muted">
          The 88-key piano roll renders at full resolution on wider screens.
          Open this on a laptop or desktop for the full cinematic experience.
        </p>
        <div className="text-[10px] font-mono text-muted mt-2">
          Tip: rotate your device or resize to at least {minWidth}px wide.
        </div>
      </div>
    </div>
  );
}
