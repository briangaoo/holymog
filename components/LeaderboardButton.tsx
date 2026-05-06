'use client';

import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

type Props = {
  onClick: () => void;
  accent: string;
};

/**
 * The "extrovert friend" button — visible and inviting, but not loud.
 * Plays one subtle bounce on entry to draw the eye, then settles.
 */
export function LeaderboardButton({ onClick, accent }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Add your score to the leaderboard"
      style={{
        touchAction: 'manipulation',
        borderColor: accent,
        color: accent,
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className="inline-flex items-center justify-center gap-2 rounded-full border bg-white/[0.03] px-4 py-2 text-xs font-medium tracking-wide transition-colors hover:bg-white/[0.06]"
    >
      <Trophy size={14} aria-hidden />
      add your score to the leaderboard
    </motion.button>
  );
}
