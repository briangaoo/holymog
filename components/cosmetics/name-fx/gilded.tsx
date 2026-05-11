'use client';

import type { ReactNode } from 'react';

/**
 * `name.gilded` — gold-leaf gradient text with a shimmer band
 * sliding across the letters every 4 seconds. Discord-Nitro-coded.
 * Background-clip:text on a wide gradient, with a secondary masked
 * ::before pseudo creating the shine sweep.
 */
export default function NameGilded({ children }: { children: ReactNode }) {
  return (
    <span className="name-fx-gilded" style={{ display: 'inline-block' }}>
      <span className="name-fx-gilded-text">{children}</span>
      <style>{`
        .name-fx-gilded {
          position: relative;
          isolation: isolate;
        }
        .name-fx-gilded-text {
          background: linear-gradient(
            180deg,
            #fef3c7 0%,
            #fde68a 25%,
            #fbbf24 50%,
            #b45309 75%,
            #78350f 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 900;
          letter-spacing: -0.01em;
          filter: drop-shadow(0 1px 0 rgba(120, 53, 15, 0.4))
                  drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-gilded::after {
            content: attr(data-text);
          }
          .name-fx-gilded-text {
            background-image: linear-gradient(
              180deg,
              #fef3c7 0%,
              #fde68a 25%,
              #fbbf24 50%,
              #b45309 75%,
              #78350f 100%
            ),
            linear-gradient(
              115deg,
              transparent 0%,
              transparent 40%,
              rgba(255,255,255,0.95) 50%,
              transparent 60%,
              transparent 100%
            );
            background-size: 100% 100%, 200% 100%;
            background-position: 0 0, -200% 0;
            background-blend-mode: lighten;
            animation: name-fx-gilded-shine 4.5s ease-in-out infinite;
          }
        }
        @keyframes name-fx-gilded-shine {
          0%, 100% { background-position: 0 0, -200% 0; }
          50% { background-position: 0 0, 200% 0; }
        }
      `}</style>
    </span>
  );
}
