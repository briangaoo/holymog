'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Four torii gate silhouettes at the cardinal points, pillar bases on the
// avatar perimeter and kasagi extending toward the outer ring. A slow
// gold pulse cycles fill opacity so the gates feel breathy / sacred.

const TORII_PATHS = (
  <g>
    {/* left pillar */}
    <rect x="41.3" y="5" width="2.2" height="15.5" rx="0.25" />
    {/* right pillar */}
    <rect x="56.5" y="5" width="2.2" height="15.5" rx="0.25" />
    {/* nuki — secondary horizontal beam */}
    <rect x="39.4" y="8" width="21.2" height="1.3" rx="0.2" />
    {/* kasagi — top beam, with subtle upturn flairs at each end */}
    <path d="M35.4 3 L64.6 3 L63.9 5.1 L36.1 5.1 Z" />
    {/* left upturn */}
    <path d="M35.4 3 L33.3 1.2 L34.1 0.4 L35.9 1.6 L35.9 3.2 Z" />
    {/* right upturn */}
    <path d="M64.6 3 L66.7 1.2 L65.9 0.4 L64.1 1.6 L64.1 3.2 Z" />
  </g>
);

export default function FrameTorii({
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
          fill="#d4af37"
          animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={
            reduced
              ? undefined
              : { duration: 4.2, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{ filter: 'drop-shadow(0 0 1.6px rgba(212,175,55,0.6))' }}
        >
          {[0, 90, 180, 270].map((angle) => (
            <g key={angle} transform={`rotate(${angle} 50 50)`}>
              {TORII_PATHS}
            </g>
          ))}
        </motion.g>
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(8, Math.round(size * 0.18)) }}
      >
        {children}
      </div>
    </div>
  );
}
