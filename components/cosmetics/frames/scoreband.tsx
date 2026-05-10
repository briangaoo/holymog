'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { UserStats } from '@/lib/customization';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

// SMART frame — reads userStats.bestScanOverall. At size ≥ 96 renders the
// peak-score digits orbiting the ring via SVG textPath; at smaller sizes
// (battle tiles, leaderboard rows) the digits would be unreadable, so we
// fall back to a clean gold ring outline. Same fallback when no score yet.

// Full-circle path at r=41 used for textPath. Starts at the 12 o'clock
// and arcs clockwise so digits read left-to-right at the top.
const RING_PATH = 'M 50 9 A 41 41 0 1 1 49.99 9 Z';

export default function FrameScoreband({
  children,
  size,
  userStats,
}: {
  children: ReactNode;
  size: number;
  userStats?: UserStats;
}) {
  const pathId = useId();
  const reduced = useReducedMotion();
  const score = userStats?.bestScanOverall ?? null;
  const digitMode = size >= 96 && score !== null;

  const inset = Math.max(6, Math.round(size * 0.10));

  if (!digitMode) {
    return (
      <div className="absolute inset-0">
        <StaticFallback context="inline-ring" color="#d4af37" ring />
        <div
          className="absolute overflow-hidden rounded-full"
          style={{ inset }}
        >
          {children}
        </div>
      </div>
    );
  }

  const scoreStr = `${score}`;
  // 24 repeats × scoreStr is more than enough to fill the path even for
  // single-digit scores; textPath clips the overflow at end-of-path.
  const filler = Array.from({ length: 24 }, () => scoreStr).join(' • ');

  return (
    <div className="absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <path id={`${pathId}-ring`} d={RING_PATH} />
        </defs>

        {/* base gold ring outline for grounding */}
        <circle
          cx="50"
          cy="50"
          r="48"
          stroke="rgba(212,175,55,0.55)"
          strokeWidth="0.45"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r="34"
          stroke="rgba(212,175,55,0.4)"
          strokeWidth="0.35"
          fill="none"
        />

        <motion.g
          style={{ transformOrigin: '50px 50px', transformBox: 'fill-box' }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={
            reduced
              ? undefined
              : { duration: 40, repeat: Infinity, ease: 'linear' }
          }
        >
          <text
            fontSize="7"
            fontWeight={700}
            fill="#d4af37"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            style={{ letterSpacing: '0.05em' }}
          >
            <textPath
              href={`#${pathId}-ring`}
              startOffset="0"
              dominantBaseline="middle"
            >
              {filler}
            </textPath>
          </text>
        </motion.g>
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset }}
      >
        {children}
      </div>
    </div>
  );
}
