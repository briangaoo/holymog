'use client';

import type { ReactNode } from 'react';

/**
 * `frame.founder` — exclusive to the founder. An avatar ring with a
 * slowly-rotating conic gold-to-crimson gradient (Gao Dynasty palette,
 * distinct from the cyan→purple S-tier gradient elsewhere). A small
 * 4-point gold spark sits at the top of the ring as a fixed crown
 * (callback to the spark inside the `o` of the holymog wordmark and
 * to the halo above the brand mark). Subtle outer glow.
 *
 * Reduced-motion: ring stops spinning, spark stops pulsing, everything
 * else stays.
 */
export default function FrameFounder({
  size,
  children,
}: {
  size: number;
  children: ReactNode;
}) {
  // Ring thickness scales with size so it stays visually balanced from
  // a 32px header avatar to a 160px profile hero. ~5% of size, min 2px.
  const ring = Math.max(2, Math.round(size * 0.05));
  const inner = size - ring * 2;
  // The spark sits above the ring; its size also scales with the frame.
  const sparkSize = Math.max(10, Math.round(size * 0.22));
  const sparkOffset = Math.round(sparkSize * 0.55);

  return (
    <span
      className="frame-founder"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
      }}
    >
      {/* Outer rotating conic ring. The inner mask creates the
          donut shape so the actual photo sits in the centre. */}
      <span
        className="frame-founder-ring"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '9999px',
        }}
      />
      {/* Photo well — sits inside the ring. */}
      <span
        style={{
          position: 'absolute',
          top: ring,
          left: ring,
          width: inner,
          height: inner,
          borderRadius: '9999px',
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </span>
      {/* Crown spark: sits above the ring, centered. */}
      <span
        className="frame-founder-spark"
        aria-hidden
        style={{
          position: 'absolute',
          top: -sparkOffset,
          left: '50%',
          width: sparkSize,
          height: sparkSize,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <svg viewBox="0 0 12 12" width={sparkSize} height={sparkSize}>
          <path
            d="M6 0 L7.1 4.9 L12 6 L7.1 7.1 L6 12 L4.9 7.1 L0 6 L4.9 4.9 Z"
            fill="url(#frame-founder-spark-grad)"
          />
          <defs>
            <linearGradient
              id="frame-founder-spark-grad"
              x1="0"
              y1="0"
              x2="12"
              y2="12"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#fffbeb" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <style>{`
        .frame-founder-ring {
          background: conic-gradient(
            from 0deg,
            #fef3c7 0%,
            #fbbf24 12%,
            #ea580c 28%,
            #991b1b 42%,
            #ea580c 58%,
            #fbbf24 78%,
            #fef3c7 100%
          );
          /* Soft outer glow that bleeds into the surrounding container. */
          box-shadow:
            0 0 ${ring * 3}px rgba(251, 191, 36, 0.35),
            0 0 ${ring * 8}px rgba(153, 27, 27, 0.25),
            inset 0 0 ${ring}px rgba(0, 0, 0, 0.35);
        }
        .frame-founder-spark {
          filter: drop-shadow(0 0 ${Math.round(sparkSize * 0.4)}px rgba(251, 191, 36, 0.75));
        }
        @media (prefers-reduced-motion: no-preference) {
          .frame-founder-ring {
            animation: frame-founder-spin 12s linear infinite;
          }
          .frame-founder-spark {
            animation: frame-founder-spark-pulse 2.8s ease-in-out infinite;
          }
        }
        @keyframes frame-founder-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes frame-founder-spark-pulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            opacity: 0.95;
          }
          50% {
            transform: translateX(-50%) scale(1.12);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}
