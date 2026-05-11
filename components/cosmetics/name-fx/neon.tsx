'use client';

import type { ReactNode } from 'react';

/**
 * `name.neon` — saturated cyan electric outline with a soft outer
 * glow and a subtle flicker every few seconds. Uses two stacked
 * text-shadow layers (close + far) for the depth of real neon.
 */
export default function NameNeon({ children }: { children: ReactNode }) {
  return (
    <span className="name-fx-neon" style={{ display: 'inline-block' }}>
      {children}
      <style>{`
        .name-fx-neon {
          color: #ecfeff;
          font-weight: 700;
          letter-spacing: 0.01em;
          text-shadow:
            0 0 2px #67e8f9,
            0 0 4px #22d3ee,
            0 0 10px #0ea5e9,
            0 0 22px rgba(14,165,233,0.6);
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-neon {
            animation: name-fx-neon-flicker 6.4s ease-in-out infinite;
          }
        }
        @keyframes name-fx-neon-flicker {
          0%, 22%, 24%, 50%, 53%, 100% {
            opacity: 1;
            text-shadow:
              0 0 2px #67e8f9,
              0 0 4px #22d3ee,
              0 0 10px #0ea5e9,
              0 0 22px rgba(14,165,233,0.6);
          }
          23% {
            opacity: 0.55;
            text-shadow:
              0 0 1px #67e8f9,
              0 0 2px #22d3ee;
          }
          52% {
            opacity: 0.75;
          }
        }
      `}</style>
    </span>
  );
}
