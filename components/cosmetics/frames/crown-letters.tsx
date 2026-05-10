'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Five tier-letter glyphs arranged across the upper arc, radii staggered
// so the silhouette reads like a crown rising from the ring. S+ at the
// apex, A flanking, B at the corners. Letters pulse in a left→right wave.

const SPIKES: { angle: number; r: number; label: string; size: number; color: string }[] = [
  { angle: -150, r: 39.5, label: 'B', size: 5.4, color: '#84cc16' },
  { angle: -120, r: 42.5, label: 'A', size: 6.4, color: '#22c55e' },
  { angle: -90,  r: 45.5, label: 'S+', size: 7.6, color: '__SGRAD__' },
  { angle: -60,  r: 42.5, label: 'A', size: 6.4, color: '#22c55e' },
  { angle: -30,  r: 39.5, label: 'B', size: 5.4, color: '#84cc16' },
];

export default function FrameCrownLetters({
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
          <linearGradient id={`${gradId}-s`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        {/* faint arc on the lower half of the ring for visual balance */}
        <path
          d="M 14.6 64 A 36 36 0 0 0 85.4 64"
          stroke="rgba(245,245,245,0.18)"
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />

        {SPIKES.map((s, i) => {
          const rad = (s.angle * Math.PI) / 180;
          const x = 50 + Math.cos(rad) * s.r;
          const y = 50 + Math.sin(rad) * s.r;
          const fill = s.color === '__SGRAD__' ? `url(#${gradId}-s)` : s.color;
          return (
            <motion.text
              key={i}
              x={x}
              y={y}
              fontSize={s.size}
              fontWeight={800}
              textAnchor="middle"
              dominantBaseline="central"
              fill={fill}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              style={{ letterSpacing: '-0.05em' }}
              animate={
                reduced ? undefined : { opacity: [0.55, 1, 0.55] }
              }
              transition={
                reduced
                  ? undefined
                  : {
                      duration: 2.8,
                      repeat: Infinity,
                      delay: i * 0.18,
                      ease: 'easeInOut',
                    }
              }
            >
              {s.label}
            </motion.text>
          );
        })}
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(8, Math.round(size * 0.17)) }}
      >
        {children}
      </div>
    </div>
  );
}
