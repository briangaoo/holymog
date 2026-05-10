'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Ten broken hearts orbiting the avatar, apex pointing inward. Each
// heart's crack line fades in/out on a slow two-beat heartbeat rhythm so
// the ring continuously breaks → mends → breaks → mends. Pulses propagate
// around the ring as a wave (per-heart delay).

const HEART_D =
  'M 0 2 ' +
  'C -1.6 0.4 -3.0 -0.6 -3.0 -1.8 ' +
  'C -3.0 -3.0 -1.6 -3.4 0 -2.0 ' +
  'C 1.6 -3.4 3.0 -3.0 3.0 -1.8 ' +
  'C 3.0 -0.6 1.6 0.4 0 2 Z';

const CRACK_D = 'M 0 -2.0 L 0.45 -1.1 L -0.35 -0.3 L 0.40 0.6 L -0.15 1.3 L 0.05 2.0';

const COUNT = 10;
const R = 41;

const HEARTS = Array.from({ length: COUNT }, (_, i) => {
  const theta = -Math.PI / 2 + (i / COUNT) * Math.PI * 2;
  const cx = 50 + Math.cos(theta) * R;
  const cy = 50 + Math.sin(theta) * R;
  const deg = (theta * 180) / Math.PI + 90; // apex points to center
  return { cx, cy, deg, delay: (i % COUNT) * 0.12 };
});

export default function FrameHeartbreaker({
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
        {HEARTS.map((h, i) => (
          <g
            key={i}
            transform={`translate(${h.cx.toFixed(2)} ${h.cy.toFixed(2)}) rotate(${h.deg.toFixed(2)})`}
          >
            <path
              d={HEART_D}
              fill="#dc2626"
              stroke="#7f1d1d"
              strokeWidth="0.3"
              strokeLinejoin="round"
            />
            <motion.path
              d={CRACK_D}
              stroke="rgba(254,202,202,0.95)"
              strokeWidth="0.38"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              animate={
                reduced ? undefined : { opacity: [0.05, 0.95, 0.10, 0.95, 0.05] }
              }
              transition={
                reduced
                  ? undefined
                  : {
                      duration: 2.6,
                      repeat: Infinity,
                      delay: h.delay,
                      times: [0, 0.22, 0.42, 0.62, 1],
                      ease: 'easeInOut',
                    }
              }
            />
          </g>
        ))}
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
