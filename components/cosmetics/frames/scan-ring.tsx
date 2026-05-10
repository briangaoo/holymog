'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Stylized MediaPipe face-mesh — a constellation of seeded dots in the
// ring band, connected by faint chord lines. A scanning beam sweeps the
// ring; dots in the beam's sector glow bright cyan ("locked on"), the
// rest sit at low ambient brightness.

const POINTS: { x: number; y: number }[] = (() => {
  let s = 1729; // fixed seed → deterministic layout
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const N = 64;
  const arr: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const baseTheta = (i / N) * Math.PI * 2;
    const theta = baseTheta + (rng() - 0.5) * 0.08;
    const r = 40 + rng() * 6;
    arr.push({
      x: 50 + Math.cos(theta) * r,
      y: 50 + Math.sin(theta) * r,
    });
  }
  return arr;
})();

const EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < POINTS.length; i++) {
    e.push([i, (i + 1) % POINTS.length]);
    if (i % 3 === 0) e.push([i, (i + 4) % POINTS.length]);
  }
  return e;
})();

const MESH = (
  <g>
    {EDGES.map(([a, b], i) => (
      <line
        key={`l${i}`}
        x1={POINTS[a].x}
        y1={POINTS[a].y}
        x2={POINTS[b].x}
        y2={POINTS[b].y}
        stroke="currentColor"
        strokeWidth="0.35"
      />
    ))}
    {POINTS.map((p, i) => (
      <circle
        key={`d${i}`}
        cx={p.x}
        cy={p.y}
        r="0.8"
        fill="currentColor"
      />
    ))}
  </g>
);

const SCAN_MASK =
  'conic-gradient(from 0deg, transparent 0deg, black 30deg, black 60deg, transparent 90deg, transparent 360deg)';

export default function FrameScanRing({
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
        style={{ color: 'rgba(165,190,210,0.42)' }}
      >
        {MESH}
      </svg>
      <motion.div
        className="absolute inset-0"
        style={{
          WebkitMaskImage: SCAN_MASK,
          maskImage: SCAN_MASK,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          transformOrigin: '50% 50%',
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={
          reduced
            ? undefined
            : { duration: 3.6, repeat: Infinity, ease: 'linear' }
        }
      >
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden
          style={{
            color: '#67e8f9',
            filter: 'drop-shadow(0 0 1.2px rgba(103,232,249,0.85))',
          }}
        >
          {MESH}
        </svg>
      </motion.div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.13)) }}
      >
        {children}
      </div>
    </div>
  );
}
