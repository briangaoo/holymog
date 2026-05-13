'use client';

import { motion, AnimatePresence } from 'framer-motion';

type Props = { visible: boolean };

export function FaceDetectedPill({ visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -32, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-emerald-500/90 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur"
          style={{ top: 'calc(max(env(safe-area-inset-top), 14px) + 36px)' }}
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white" />
            Face Detected!
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
