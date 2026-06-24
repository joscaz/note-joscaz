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
  /** Supabase access token. Export is impossible without one — the dialog
   * surfaces an auth-required message rather than attempting the request. */
  accessToken?: string;
}

type DialogPhase = 'picking' | 'running' | 'done' | 'error';

const QUALITY_OPTIONS: { quality: ExportQuality; label: string; hint: string }[] = [
  { quality: 'low', label: 'Low', hint: '854×480 · 24fps' },
  { quality: 'medium', label: 'Medium', hint: '1280×720 · 30fps' },
  { quality: 'high', label: 'High', hint: '1920×1080 · 30fps' },
];

/** User-facing copy per ExportErrorCode — mirrors design §10's FAILURES table. */
const ERROR_MESSAGES: Record<ExportErrorCode, string> = {
  'auth-required': 'Please sign in to export a video.',
  'token-expired': 'Your session or export token expired. Reload your piece and try again.',
  'token-invalid': 'This piece is not eligible for export. Reload your piece and try again.',
  'too-large': 'The export is too large — pick a lower quality.',
  'quota-exceeded': "You've reached today's export limit. Try again tomorrow.",
  timeout: 'Export timed out on the server — try a lower quality.',
  aborted: 'Export cancelled.',
  'unsupported-browser': 'Your browser does not support video export.',
  unknown: 'Something went wrong while exporting. Please try again.',
};

const STAGE_LABELS: ExportStage[] = ['Rendering audio', 'Capturing frames', 'Packaging', 'Uploading', 'Encoding', 'Done'];

export function ExportDialog({
  open,
  onClose,
  notes,
  instrument,
  scrollSpeed,
  durationSec,
  pianoSustain,
  accessToken,
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
    if (!accessToken) {
      setPhase('error');
      setErrorMessage(ERROR_MESSAGES['auth-required']);
      return;
    }

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
        accessToken,
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
  }, [accessToken, notes, instrument, scrollSpeed, durationSec, quality, pianoSustain]);

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
                <a
                  href={resultUrl}
                  download={resultFilename}
                  onClick={handleClose}
                  className="w-full rounded-full py-3 text-sm font-semibold text-black text-center transition-transform hover:scale-[1.02] active:scale-95"
                  style={{ background: grad.top, boxShadow: `0 4px 20px ${grad.glow}` }}
                >
                  Download {resultFilename}
                </a>
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
