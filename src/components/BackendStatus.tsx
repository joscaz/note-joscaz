import { useEffect, useState } from 'react';
import { isSessionLoaded } from '../services/onnx/session';
import type { InstrumentType } from '../utils/noteColors';

/**
 * Tiny pill describing the state of the in-browser ONNX model:
 * - "Real MIDI"     the last result was produced by the model
 * - "Model ready"   the `.onnx` file has been downloaded & compiled
 * - "Demo mode"     first run not done yet; upcoming result will be real once audio is uploaded
 */
export function BackendStatus({
  isRealResult,
  instrument,
}: {
  isRealResult: boolean;
  instrument?: InstrumentType;
}) {
  // isSessionLoaded() is synchronous; poll on an interval so the pill updates
  // a heartbeat after the first transcription finishes downloading the model.
  const [loaded, setLoaded] = useState(
    instrument ? isSessionLoaded(instrument) : false,
  );
  useEffect(() => {
    if (!instrument) return;
    if (loaded) return;
    const id = setInterval(() => {
      if (isSessionLoaded(instrument)) {
        setLoaded(true);
        clearInterval(id);
      }
    }, 500);
    return () => clearInterval(id);
  }, [instrument, loaded]);

  const { dot, label, title } = presentation(isRealResult, loaded);

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
  modelLoaded: boolean,
): { dot: string; label: string; title: string } {
  if (isRealResult) {
    return {
      dot: '#00f5a0',
      label: 'Real MIDI · In-browser',
      title:
        'MIDI transcribed by the ONNX model running entirely in your browser.',
    };
  }
  if (modelLoaded) {
    return {
      dot: '#00b4d8',
      label: 'Model ready',
      title:
        'ONNX model downloaded & compiled. Upload audio and hit Transcribe for real MIDI.',
    };
  }
  return {
    dot: '#6b6b9a',
    label: 'Demo mode',
    title:
      'Showing mock MIDI. The ONNX model will download on first real transcription.',
  };
}
