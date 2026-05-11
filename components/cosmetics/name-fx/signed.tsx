'use client';

import type { ReactNode } from 'react';

/**
 * `name.signed` — handwritten signature underline draws under the
 * name once on mount via SVG stroke-dashoffset. Subtle gold ink.
 * Static after the draw completes.
 */
export default function NameSigned({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        paddingBottom: '0.3em',
      }}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '0.55em',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <linearGradient id="signed-ink" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4af37" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#a16207" />
          </linearGradient>
        </defs>
        <path
          d="M 1 7 Q 18 2, 35 6 T 70 5 T 95 7"
          fill="none"
          stroke="url(#signed-ink)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="160"
          strokeDashoffset="160"
          style={{ animation: 'sig-draw 1.4s 0.15s ease-out forwards' }}
        />
        {/* Flourish dot */}
        <circle
          cx="97"
          cy="7"
          r="1.4"
          fill="#fbbf24"
          style={{ animation: 'sig-dot 0.3s 1.5s ease-out forwards', opacity: 0 }}
        />
      </svg>
      <style>{`
        @keyframes sig-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes sig-dot {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          path[style*="sig-draw"] { animation: none !important; stroke-dashoffset: 0 !important; }
          circle[style*="sig-dot"] { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
    </span>
  );
}
