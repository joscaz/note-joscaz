import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteEvent } from '../services/audioEngine';
import type { InstrumentType } from '../utils/noteColors';
import { NOTE_GRADIENTS } from '../utils/noteColors';
import {
  runExport,
  ExportError,
  type ExportStage,
  type ExportErrorCode,
} from '../services/exportService';
import { DEFAULT_EXPORT_QUALITY, type ExportQuality } from '../types/exportPresets';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  notes: readonly NoteEvent[];
  instrument: InstrumentType;
  scrollSpeed: number;
  durationSec: number;
  pianoSustain: boolean;
}

type DialogPhase = 'picking' | 'running' | 'done' | 'error';

const QUALITY_OPTIONS: { quality: ExportQuality; label: string; hint: string }[] = [
  { quality: 'low', label: 'Low', hint: '854×480 · 24fps' },
  { quality: 'medium', label: 'Medium', hint: '1280×720 · 30fps' },
  { quality: 'high', label: 'High', hint: '1920×1080 · 120fps' },
];

/** User-facing copy per ExportErrorCode. */
const ERROR_MESSAGES: Record<ExportErrorCode, string> = {
  'unsupported-browser': 'Your browser does not support hardware video encoding. Try Chrome or Edge.',
  aborted: 'Export cancelled.',
  'encode-failed': 'Video encoding failed. Try a lower quality or a different browser.',
  unknown: 'Something went wrong while exporting. Please try again.',
};

const STAGE_LABELS: ExportStage[] = ['Rendering audio', 'Encoding video', 'Finalizing', 'Done'];

export function ExportDialog({
  open,
  onClose,
  notes,
  instrument,
  scrollSpeed,
  durationSec,
  pianoSustain,
}: ExportDialogProps) {
  const grad = NOTE_GRADIENTS[instrument];
  const [quality, setQuality] = useState<ExportQuality>(DEFAULT_EXPORT_QUALITY);
  const [phase, setPhase] = useState<DialogPhase>('picking');
  const [stage, setStage] = useState<ExportStage>('Rendering audio');
  const [stageDetail, setStageDetail] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset to the picker whenever the dialog is freshly opened.
  useEffect(() => {
    if (open) {
      setPhase('picking');
      setStage('Rendering audio');
      setStageDetail(undefined);
      setErrorMessage(null);
      setResultUrl(null);
      setResultFilename(null);
    }
  }, [open]);

  // Revoke any object URL we created once the dialog unmounts/closes for
  // good, so we don't leak a Blob URL across exports.
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleClose = useCallback(() => {
    if (phase === 'running') {
      abortRef.current?.abort();
    }
    // Release the result blob URL when the dialog is dismissed (Done button,
    // backdrop, or Escape) so a finished 'high' export (100+ MB) isn't pinned
    // in memory until the next open. This path is never reached by the download
    // anchor itself — downloading no longer closes the dialog — so the revoke
    // can't race Chrome's asynchronous blob read.
    setResultUrl(null);
    onClose();
  }, [phase, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  const handleStart = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setErrorMessage(null);

    try {
      const result = await runExport({
        notes,
        instrument,
        scrollSpeed,
        durationSec,
        quality,
        pianoSustain,
        signal: controller.signal,
        onProgress: (progress) => {
          setStage(progress.stage);
          setStageDetail(progress.detail);
        },
      });
      setResultUrl(result.objectUrl);
      setResultFilename(result.filename);
      setPhase('done');
    } catch (err) {
      // A user-initiated cancel surfaces either as ExportError('aborted')
      // (runExport's own throwIfAborted) OR as a raw DOMException named
      // 'AbortError' — renderExportAudio and withTimeoutAndAbort reject with
      // that directly when the signal fires mid-render. Treat both as a quiet
      // return to the picker, not the generic "something went wrong" error.
      const isAbort =
        (err instanceof ExportError && err.code === 'aborted') ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (isAbort) {
        setPhase('picking');
        return;
      }
      if (err instanceof ExportError) {
        setErrorMessage(ERROR_MESSAGES[err.code]);
      } else {
        console.error('[NoteJoscaz] Export failed:', err);
        setErrorMessage(ERROR_MESSAGES.unknown);
      }
      setPhase('error');
    } finally {
      abortRef.current = null;
    }
  }, [notes, instrument, scrollSpeed, durationSec, quality, pianoSustain]);

  const activeStageIdx = STAGE_LABELS.indexOf(stage);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={phase === 'running' ? undefined : handleClose}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-lg w-[92%] glass rounded-3xl border border-white/10 p-8 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
          >
            <div className="flex items-start justify-between">
              <h2 id="export-dialog-title" className="font-display text-xl font-extrabold text-text">
                Export MP4
              </h2>
              {phase !== 'running' && (
                <button
                  onClick={handleClose}
                  className="text-muted hover:text-text transition-colors"
                  aria-label="Close"
                >
                  ✕
                </button>
              )}
            </div>

            {phase === 'picking' && (
              <>
                {navigator.userAgent.includes('Firefox') && (
                  <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200 leading-relaxed">
                    Firefox does not support hardware H.264 encoding — export may fail or be
                    slow. For best results, use Chrome or Edge.
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.quality}
                      onClick={() => setQuality(opt.quality)}
                      className={`rounded-xl border p-3 text-center transition-all ${
                        quality === opt.quality
                          ? 'border-white/30 bg-white/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                      style={
                        quality === opt.quality
                          ? { boxShadow: `0 0 16px ${grad.glow}` }
                          : undefined
                      }
                    >
                      <div className="text-sm font-semibold text-text">{opt.label}</div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">{opt.hint}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Effects and particles are always rendered at full quality in the export,
                  regardless of your live graphics setting.
                </p>
                <button
                  onClick={() => void handleStart()}
                  className="w-full rounded-full py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95"
                  style={{ background: grad.top, boxShadow: `0 4px 20px ${grad.glow}` }}
                >
                  Start export
                </button>
              </>
            )}

            {phase === 'running' && (
              <>
                <div className="text-center space-y-1">
                  <div className="font-display text-lg font-bold text-text">{stage}</div>
                  {stageDetail != null && (
                    <div className="font-mono text-xs text-muted tabular-nums">
                      {Math.round(stageDetail * 100)}%
                    </div>
                  )}
                </div>
                <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: `linear-gradient(90deg, ${grad.top}, ${grad.bottom})` }}
                    animate={{
                      width:
                        stageDetail != null
                          ? `${Math.min(100, stageDetail * 100)}%`
                          : activeStageIdx >= 0
                            ? `${((activeStageIdx + 0.5) / STAGE_LABELS.length) * 100}%`
                            : '10%',
                    }}
                    transition={{ ease: 'easeInOut', duration: 0.3 }}
                  />
                </div>
                <button
                  onClick={handleClose}
                  className="w-full rounded-full border border-white/10 py-2.5 text-xs font-mono uppercase tracking-wider text-muted hover:text-text hover:border-white/30 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {phase === 'done' && resultUrl && resultFilename && (
              <>
                <p className="text-sm text-text text-center">Your video is ready.</p>
                {/* The download anchor deliberately does NOT close the dialog or
                    revoke the blob URL. Chrome reads the blob asynchronously
                    after the click, so revoking here races the read and fails
                    large files ("Failed - Network error"). The URL is released
                    only when a new export replaces it or the dialog unmounts
                    (the [resultUrl] cleanup effect). The user closes via Done. */}
                <a
                  href={resultUrl}
                  download={resultFilename}
                  className="w-full rounded-full py-3 text-sm font-semibold text-black text-center transition-transform hover:scale-[1.02] active:scale-95"
                  style={{ background: grad.top, boxShadow: `0 4px 20px ${grad.glow}` }}
                >
                  Download {resultFilename}
                </a>
                <button
                  onClick={handleClose}
                  className="w-full rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors py-3 text-sm font-semibold text-text"
                >
                  Done
                </button>
              </>
            )}

            {phase === 'error' && (
              <>
                <p className="text-sm text-pink text-center">{errorMessage}</p>
                <button
                  onClick={() => setPhase('picking')}
                  className="w-full rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors py-3 text-sm font-semibold text-text"
                >
                  Try again
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
