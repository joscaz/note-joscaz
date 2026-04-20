import { useEffect, useState } from 'react';

const API_BASE: string =
  (import.meta.env.VITE_TRANSCRIBE_API_URL as string | undefined) ??
  'http://localhost:8000';

const HEALTH_POLL_MS = 30_000;

type HealthState = 'unknown' | 'ready' | 'offline';

/**
 * Tiny pill describing backend connectivity + last result source:
 * - "Real MIDI"       last transcription came from the server
 * - "Backend ready"   GET /health returned {status: "ok"}
 * - "Backend offline" /health failed / unreachable
 */
export function BackendStatus({
  isRealResult,
}: {
  isRealResult: boolean;
}) {
  const [health, setHealth] = useState<HealthState>('unknown');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(`${API_BASE}/health`, {
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if (cancelled) return;
        setHealth(res.ok ? 'ready' : 'offline');
      } catch {
        if (cancelled) return;
        setHealth('offline');
      }
    };

    void check();
    const id = setInterval(() => void check(), HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const { dot, label, title } = presentation(isRealResult, health);

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-[10px] font-mono uppercase tracking-wider"
      title={title}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: dot, boxShadow: `0 0 8px ${dot}` }}
      />
      <span className="text-muted">{label}</span>
    </div>
  );
}

function presentation(
  isRealResult: boolean,
  health: HealthState,
): { dot: string; label: string; title: string } {
  if (isRealResult) {
    return {
      dot: '#00f5a0',
      label: 'Real MIDI · Backend',
      title: 'MIDI transcribed by the self-hosted backend model.',
    };
  }
  if (health === 'ready') {
    return {
      dot: '#00b4d8',
      label: 'Backend ready',
      title:
        'Transcription backend is reachable. Upload audio and hit Transcribe.',
    };
  }
  if (health === 'offline') {
    return {
      dot: '#ff6b6b',
      label: 'Backend offline',
      title:
        'Transcription backend is unreachable. Uploads will fall back to demo MIDI.',
    };
  }
  return {
    dot: '#6b6b9a',
    label: 'Checking backend…',
    title: 'Pinging the transcription backend.',
  };
}
