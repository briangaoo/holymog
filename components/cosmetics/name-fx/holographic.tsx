'use client';

import type { ReactNode } from 'react';

/**
 * `name.holographic` — iridescent foil-sticker animation. Letters
 * filled by a multi-stop gradient cycling cyan → magenta → gold →
 * cyan at a 35° angle, slow 6s loop. Pokémon-card-holo vibe.
 */
export default function NameHolographic({ children }: { children: ReactNode }) {
  return (
    <span className="name-fx-holographic" style={{ display: 'inline-block' }}>
      {children}
      <style>{`
        .name-fx-holographic {
          background: linear-gradient(
            115deg,
            #22d3ee 0%,
            #67e8f9 12%,
            #c084fc 25%,
            #f0abfc 38%,
            #fda4af 50%,
            #fde047 62%,
            #86efac 75%,
            #67e8f9 87%,
            #22d3ee 100%
          );
          background-size: 400% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 800;
          letter-spacing: -0.01em;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-holographic {
            animation: name-fx-holo-slide 6s linear infinite;
          }
        }
        @keyframes name-fx-holo-slide {
          0% { background-position: 0% 50%; }
          100% { background-position: 400% 50%; }
        }
      `}</style>
    </span>
  );
}
