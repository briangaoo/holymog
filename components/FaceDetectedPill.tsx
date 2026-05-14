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
          className="absolute left-1/2 z-20 -translate-x-1/2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 14px) + 24px)',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(8px) saturate(1.4)',
            border: '2px solid #10b981',
            borderRadius: 2,
          }}
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="relative inline-flex h-1.5 w-1.5"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-[#10b981]/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            </span>
            FACE LOCKED
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
