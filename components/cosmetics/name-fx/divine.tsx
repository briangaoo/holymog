'use client';

import type { ReactNode } from 'react';

/**
 * `name.divine` — soft golden glow on the letters + a thin halo
 * arc rendered above the text. Subtle, devotional, not flashy.
 * Halo uses an SVG ellipse drawn above the wrapper.
 */
export default function NameDivine({ children }: { children: ReactNode }) {
  return (
    <span
      className="name-fx-divine"
      style={{
        position: 'relative',
        display: 'inline-block',
        paddingTop: '0.35em',
      }}
    >
      {/* Halo above */}
      <svg
        aria-hidden
        viewBox="0 0 100 14"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: '5%',
          right: '5%',
          top: '-0.1em',
          width: '90%',
          height: '0.55em',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <radialGradient id="divine-halo" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(253,224,71,0.9)" />
            <stop offset="60%" stopColor="rgba(253,224,71,0.35)" />
            <stop offset="100%" stopColor="rgba(253,224,71,0)" />
          </radialGradient>
        </defs>
        <ellipse
          cx="50"
          cy="7"
          rx="48"
          ry="5"
          fill="url(#divine-halo)"
        />
        <ellipse
          cx="50"
          cy="7"
          rx="44"
          ry="2.5"
          fill="none"
          stroke="rgba(253,224,71,0.85)"
          strokeWidth="0.8"
        />
      </svg>

      {/* Name with golden glow */}
      <span className="name-fx-divine-text">{children}</span>

      <style>{`
        .name-fx-divine-text {
          color: #fef3c7;
          font-weight: 700;
          letter-spacing: -0.005em;
          text-shadow:
            0 0 4px rgba(253,224,71,0.85),
            0 0 14px rgba(253,224,71,0.45),
            0 0 28px rgba(255,255,255,0.30);
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-divine-text {
            animation: name-fx-divine-pulse 3.6s ease-in-out infinite;
          }
        }
        @keyframes name-fx-divine-pulse {
          0%, 100% {
            text-shadow:
              0 0 4px rgba(253,224,71,0.85),
              0 0 14px rgba(253,224,71,0.45),
              0 0 28px rgba(255,255,255,0.30);
          }
          50% {
            text-shadow:
              0 0 6px rgba(253,224,71,1),
              0 0 22px rgba(253,224,71,0.65),
              0 0 40px rgba(255,255,255,0.45);
          }
        }
      `}</style>
    </span>
  );
}
