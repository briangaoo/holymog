'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useAchievementToast } from '@/hooks/useAchievementToast';

const DISMISS_AFTER_MS = 5000;

/**
 * Top-right achievement toast container. Subscribes to the
 * module-level toast queue and renders one card per pending grant.
 *
 * Mounted once in Providers.tsx so toasts fire from anywhere in the
 * app. Each toast auto-dismisses after 5s; the user can also click
 * the × to close early.
 */
export function AchievementToastContainer() {
  const { queue, dismiss } = useAchievementToast();

  useEffect(() => {
    if (queue.length === 0) return;
    const first = queue[0];
    const t = window.setTimeout(
      () => dismiss(first.achievement_key),
      DISMISS_AFTER_MS,
    );
    return () => window.clearTimeout(t);
  }, [queue, dismiss]);

  return (
    <div
      className="pointer-events-none fixed right-5 z-[100] flex flex-col gap-2"
      style={{ top: 'max(env(safe-area-inset-top), 20px)' }}
    >
      <AnimatePresence>
        {queue.map((grant) => (
          <motion.div
            key={grant.achievement_key}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="pointer-events-auto flex w-72 items-start gap-3 border-2 border-white bg-black p-3"
            style={{ borderRadius: 2 }}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center bg-white" style={{ borderRadius: 2 }}>
              <Sparkles size={16} className="text-black" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white">
                UNLOCKED
              </span>
              <span className="truncate text-[14px] font-bold uppercase text-white">
                {grant.name}
              </span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/50">
                EQUIP FROM ACCOUNT → CUSTOMIZATION
              </span>
            </div>
            <button
              type="button"
              onClick={() => dismiss(grant.achievement_key)}
              className="flex-shrink-0 text-zinc-400 hover:text-white"
              aria-label="dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
