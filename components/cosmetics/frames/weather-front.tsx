'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

function isobarPath(R: number, distortion: number, phase: number): string {
  const samples = 160;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const theta = t * Math.PI * 2;
    const r =
      R +
      Math.sin(theta * 3 + phase) * distortion +
      Math.cos(theta * 5 + phase * 1.4) * distortion * 0.45;
    const x = 50 + Math.cos(theta) * r;
    const y = 50 + Math.sin(theta) * r;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ') + ' Z';
}

// Pre-baked at module scope so we don't regenerate paths every render.
// Radii clustered in the outer band so they're visible past the avatar
// inset (which covers everything inside r ≈ 36 viewBox units).
const ISOBARS: { d: string; stroke: string; width: number }[] = [
  { d: isobarPath(47, 1.0, 0.0), stroke: 'rgba(210,222,240,0.92)', width: 0.6 },
  { d: isobarPath(44.2, 1.1, 0.7), stroke: 'rgba(180,198,222,0.85)', width: 0.55 },
  { d: isobarPath(41.4, 1.2, 1.4), stroke: 'rgba(150,172,202,0.75)', width: 0.5 },
  { d: isobarPath(38.6, 1.2, 2.2), stroke: 'rgba(122,148,182,0.65)', width: 0.5 },
  { d: isobarPath(35.8, 1.3, 3.0), stroke: 'rgba(98,124,160,0.55)', width: 0.45 },
];

// Single forked lightning bolt — drawn once, flashed briefly each loop.
const LIGHTNING_D =
  'M50 4 L53 14 L47 20 L54 30 L49 38 L56 48 L50 56 L55 66 ' +
  'M49 38 L41 46 L46 50 ' +
  'M55 48 L62 52 L58 58';

export default function FrameWeatherFront({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
  userStats?: never;
}) {
  const reduced = useReducedMotion();

  const slow = useMemo(
    () =>
      reduced
        ? undefined
        : { rotate: 360, transition: { duration: 60, repeat: Infinity, ease: 'linear' as const } },
    [reduced],
  );

  return (
    <div className="absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <motion.g
          style={{ transformOrigin: '50px 50px', transformBox: 'fill-box' }}
          animate={slow ? { rotate: slow.rotate } : undefined}
          transition={slow ? slow.transition : undefined}
        >
          {ISOBARS.map((iso, i) => (
            <path
              key={i}
              d={iso.d}
              stroke={iso.stroke}
              strokeWidth={iso.width}
              fill="none"
            />
          ))}
        </motion.g>

        <motion.g
          animate={reduced ? undefined : { opacity: [0, 0, 1, 0.25, 1, 0, 0] }}
          transition={
            reduced
              ? undefined
              : {
                  duration: 5.6,
                  repeat: Infinity,
                  times: [0, 0.78, 0.81, 0.83, 0.85, 0.89, 1],
                  ease: 'linear',
                }
          }
        >
          <path
            d={LIGHTNING_D}
            stroke="rgba(254,243,199,0.95)"
            strokeWidth="1.1"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={LIGHTNING_D}
            stroke="#fff7d6"
            strokeWidth="0.45"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </motion.g>
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(8, Math.round(size * 0.16)) }}
      >
        {children}
      </div>
    </div>
  );
}
