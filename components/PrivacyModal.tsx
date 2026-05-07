'use client';

import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  open: boolean;
  onAcknowledge: () => void;
};

export function PrivacyModal({ open, onAcknowledge }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <h2 id="privacy-title" className="mb-3 text-lg font-semibold text-white">
              Your privacy
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>
                When you take a photo, it&apos;s sent briefly to xAI&apos;s vision model for
                analysis, then discarded. holymog doesn&apos;t store your photo unless you opt
                in to attach it to a leaderboard entry.
              </p>
              <p>
                When you share to social media, only your tier letter is shared, never your
                photo or sub-scores.
              </p>
              <p>
                If you choose to add yourself to the leaderboard, your name, overall score,
                tier, and sub-scores are saved publicly. Your photo is saved only if you
                opt in.
              </p>
            </div>
            <button
              type="button"
              onClick={onAcknowledge}
              aria-label="Continue"
              style={{ touchAction: 'manipulation' }}
              className="mt-6 h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
