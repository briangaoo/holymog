'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Server-rack cable bundle: three wavy strands at 120° phase offsets so
// they read as a braid as they pass each other around the ring. Each
// wire gets a soft dark underlay (for separation against the avatar +
// page bg) plus a thin specular highlight to suggest plastic insulation.

const BRAIDS = 3; // oscillations per loop
const AMP = 5.2; // radial deviation
const R_CENTER = 39;
const SAMPLES = 220;
const CX = 50;
const CY = 50;
const PHI = (2 * Math.PI) / 3;

function buildPath(phaseOffset: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const theta = t * Math.PI * 2;
    const phase = theta * BRAIDS + phaseOffset;
    const r = R_CENTER + Math.sin(phase) * AMP;
    const x = CX + Math.cos(theta) * r;
    const y = CY + Math.sin(theta) * r;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ') + ' Z';
}

const WIRES: { d: string; color: string; highlight: string }[] = [
  { d: buildPath(0), color: '#dc2626', highlight: 'rgba(255,180,170,0.55)' },
  { d: buildPath(PHI), color: '#eab308', highlight: 'rgba(255,235,160,0.55)' },
  { d: buildPath(2 * PHI), color: '#2563eb', highlight: 'rgba(180,210,255,0.55)' },
];

export default function FrameCable({
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
      <motion.div
        className="absolute inset-0"
        style={{ transformOrigin: '50% 50%' }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={
          reduced
            ? undefined
            : { duration: 26, repeat: Infinity, ease: 'linear' }
        }
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {WIRES.map((w, i) => (
            <g key={i}>
              <path
                d={w.d}
                stroke="rgba(8,8,10,0.85)"
                strokeWidth="5.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={w.d}
                stroke={w.color}
                strokeWidth="3.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={w.d}
                stroke={w.highlight}
                strokeWidth="0.9"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
        </svg>
      </motion.div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.10)) }}
      >
        {children}
      </div>
    </div>
  );
}
