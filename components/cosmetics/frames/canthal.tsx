'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Ring of stylized eyes with positive canthal tilt, each oriented so its
// gaze (inner-corner side) points radially inward at the avatar. Iris
// + sclera + upper-lid highlight give it that looksmaxxing diagram feel.

const TILT = -14; // canthal tilt — outer corner lifted in screen space
const COUNT = 14;
const R_RING = 43;

const EYE = (
  <g>
    <path
      d="M-3.6 0 Q-1.6 -1.4 0 -1.4 Q1.6 -1.4 3.6 0 Q1.6 1.4 0 1.4 Q-1.6 1.4 -3.6 0 Z"
      fill="rgba(254,243,199,0.15)"
      stroke="#fde68a"
      strokeWidth="0.45"
      strokeLinejoin="round"
    />
    <circle cx="0" cy="0" r="1.05" fill="#fbbf24" opacity="0.92" />
    <circle cx="0.2" cy="-0.2" r="0.42" fill="#0a0a0a" />
    <circle cx="0.45" cy="-0.45" r="0.16" fill="#fffbeb" opacity="0.95" />
    <path
      d="M-3.0 -0.18 Q0 -1.5 3.0 -0.18"
      stroke="rgba(255,250,230,0.95)"
      strokeWidth="0.32"
      fill="none"
      strokeLinecap="round"
    />
  </g>
);

export default function FrameCanthal({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
  userStats?: never;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <motion.g
          animate={reduced ? undefined : { opacity: [0.78, 1, 0.78] }}
          transition={
            reduced
              ? undefined
              : { duration: 4.4, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          {Array.from({ length: COUNT }).map((_, i) => {
            const theta = (i / COUNT) * Math.PI * 2;
            const cx = 50 + Math.cos(theta) * R_RING;
            const cy = 50 + Math.sin(theta) * R_RING;
            const deg = (theta * 180) / Math.PI;
            return (
              <g
                key={i}
                transform={`translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg}) rotate(${TILT})`}
              >
                {EYE}
              </g>
            );
          })}
        </motion.g>
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.14)) }}
      >
        {children}
      </div>
    </div>
  );
}
