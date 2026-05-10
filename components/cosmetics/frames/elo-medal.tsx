'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Six tier bands stacked outermost (F) to innermost (S+). S sits closest
// to the avatar so it reads as the bullseye — climbing tiers = climbing
// inward. A thin gold glint sweeps the whole medallion on a slow loop.

const BANDS: { color: string; r: number }[] = [
  { color: '#ef4444', r: 48.5 }, // F
  { color: '#f97316', r: 45.5 }, // D
  { color: '#eab308', r: 42.5 }, // C
  { color: '#84cc16', r: 39.5 }, // B
  { color: '#22c55e', r: 36.5 }, // A
];

const BAND_W = 2.5;
const S_R = 33.5; // innermost S band radius

const GLINT_MASK =
  'conic-gradient(from 0deg, transparent 0deg, transparent 70deg, black 90deg, transparent 110deg, transparent 360deg)';

export default function FrameEloMedal({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
  userStats?: never;
}) {
  const gradId = useId();
  const reduced = useReducedMotion();
  return (
    <div className="absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient
            id={`${gradId}-s`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        {/* dark base ring for separation from the avatar */}
        <circle
          cx="50"
          cy="50"
          r="50"
          stroke="rgba(8,8,10,0.7)"
          strokeWidth="0.6"
          fill="none"
        />

        {BANDS.map((b) => (
          <circle
            key={b.color}
            cx="50"
            cy="50"
            r={b.r}
            stroke={b.color}
            strokeWidth={BAND_W}
            fill="none"
          />
        ))}

        {/* S band — gradient stroke for the bullseye */}
        <circle
          cx="50"
          cy="50"
          r={S_R}
          stroke={`url(#${gradId}-s)`}
          strokeWidth={BAND_W}
          fill="none"
        />

        {/* faint band separators for medallion definition */}
        {BANDS.map((b) => (
          <circle
            key={`sep-${b.color}`}
            cx="50"
            cy="50"
            r={b.r - BAND_W / 2}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.3"
            fill="none"
          />
        ))}
      </svg>

      {/* rotating gold glint */}
      <motion.div
        className="absolute inset-0"
        style={{
          WebkitMaskImage: GLINT_MASK,
          maskImage: GLINT_MASK,
          transformOrigin: '50% 50%',
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={
          reduced
            ? undefined
            : { duration: 9, repeat: Infinity, ease: 'linear' }
        }
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {[...BANDS, { color: 'rgba(255,236,170,0.8)', r: S_R }].map(
            (b, i) => (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={b.r}
                stroke="rgba(255,235,170,0.9)"
                strokeWidth={BAND_W + 0.2}
                fill="none"
              />
            ),
          )}
        </svg>
      </motion.div>

      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(9, Math.round(size * 0.22)) }}
      >
        {children}
      </div>
    </div>
  );
}
