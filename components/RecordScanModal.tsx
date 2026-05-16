'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { getScoreColor } from '@/lib/scoreColor';
import { getTier } from '@/lib/tier';

type Props = {
  open: boolean;
  /** The scan's overall (0-100). Drives the colour + the headline copy. */
  overall: number;
  /** True when this is the user's first scan ever — copy shifts from
   *  "new personal record" to "first scan" so it doesn't feel weird. */
  isFirst: boolean;
  onYes: () => void;
  onNo: () => void;
};

/**
 * Lightweight celebratory prompt that fires when a scan beats the
 * device-local best (including the implicit-record first scan). Two
 * outcomes: "yes" hands off to the parent (which opens the existing
 * leaderboard modal or auth modal depending on sign-in state); "no"
 * closes silently and the user keeps their result on screen.
 *
 * Mounted via portal so it isn't clipped by the scan page's many
 * fixed/absolute layers (camera, results, ambient washes).
 */
export function RecordScanModal({ open, overall, isFirst, onYes, onNo }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock body scroll while open so a tap on the dimmed area doesn't
  // scroll the page underneath.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  const tier = getTier(overall);
  const accent = tier.isGradient ? '#a855f7' : tier.color;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-scan-title"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm border-2 border-white/20 bg-black p-6"
            style={{
              borderRadius: 2,
              boxShadow: `0 0 48px -12px ${accent}66`,
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Trophy size={14} aria-hidden style={{ color: accent }} />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: accent }}
              >
                {isFirst ? 'FIRST SCAN' : 'NEW PERSONAL RECORD'}
              </span>
            </div>
            <h2
              id="record-scan-title"
              className="mb-3 text-2xl font-bold uppercase leading-tight tracking-tight text-white"
            >
              {isFirst ? "you're on the board?" : 'put it on the board?'}
            </h2>
            <p className="mb-6 text-[13px] leading-relaxed text-white/65">
              you scored a{' '}
              <span
                className="font-num font-bold tabular-nums"
                style={{ color: getScoreColor(overall) }}
              >
                {overall}
              </span>
              {isFirst
                ? ' on your first scan. add it to the public leaderboard so others can see where you land.'
                : ' — your highest yet. update your leaderboard entry?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onNo}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
              >
                NOT NOW
              </button>
              <button
                type="button"
                onClick={onYes}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90"
              >
                <Trophy size={12} aria-hidden /> ADD TO BOARD
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}
