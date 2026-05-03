import { AnimatePresence, motion } from 'framer-motion';

interface LimitReachedDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LimitReachedDialog({ open, onClose }: LimitReachedDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-sm w-[92%] glass rounded-3xl border border-white/10 p-8 flex flex-col gap-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pink/10 border border-pink/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-pink"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-xl font-extrabold text-text">
                Transcription limit reached
              </h2>
              <p className="text-sm text-muted leading-relaxed">
                You've used all your available transcriptions. Check back tomorrow — your limit resets daily.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors py-3 text-sm font-semibold text-text"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
