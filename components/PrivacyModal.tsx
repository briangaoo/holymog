'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'mogem-privacy-acknowledged';

export function PrivacyModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const handleContinue = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

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
                When you take a photo, it&apos;s sent briefly to NVIDIA&apos;s vision model via
                fal.ai for analysis, then discarded. Mogem doesn&apos;t store your photo.
              </p>
              <p>
                When you share, only your tier letter is shared — never your photo or sub-scores.
              </p>
            </div>
            <button
              type="button"
              onClick={handleContinue}
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
