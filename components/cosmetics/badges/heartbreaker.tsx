'use client';

/**
 * S tier badge — "heartbreaker". Gradient pill with a slow shimmer
 * cycle. Stronger than chad, quieter than true-adam.
 */
export default function BadgeHeartbreaker({ size }: { size: number }) {
  return (
    <span className="badge-heartbreaker">
      <span className="badge-heartbreaker-text">heartbreaker</span>
      <style>{`
        .badge-heartbreaker {
          position: relative;
          display: inline-flex;
          align-items: center;
          height: 100%;
          padding: 0 0.75em;
          font-size: ${size * 0.5}px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: lowercase;
          white-space: nowrap;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(168, 85, 247, 0.85);
          background:
            radial-gradient(
              ellipse at top left,
              rgba(34, 211, 238, 0.25) 0%,
              rgba(168, 85, 247, 0.20) 50%,
              rgba(236, 72, 153, 0.18) 100%
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.10),
            0 0 12px rgba(168, 85, 247, 0.30);
        }
        .badge-heartbreaker-text {
          background-image: linear-gradient(
            115deg,
            #22d3ee 0%,
            #a855f7 50%,
            #ec4899 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 5px rgba(168, 85, 247, 0.65));
        }
        @media (prefers-reduced-motion: no-preference) {
          .badge-heartbreaker-text {
            animation: hb-shimmer 4.5s linear infinite;
          }
        }
        @keyframes hb-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </span>
  );
}
