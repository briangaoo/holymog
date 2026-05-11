'use client';

/**
 * S tier badge — "heartbreaker". Gradient pill with slow shimmer
 * cycling cyan → purple → pink. Stronger than chad, quieter than
 * true-adam.
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
          padding: 0 0.7em;
          font-size: ${size * 0.58}px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: lowercase;
          white-space: nowrap;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(168, 85, 247, 0.9);
          background:
            linear-gradient(
              115deg,
              rgba(8, 47, 73, 0.90) 0%,
              rgba(59, 7, 100, 0.90) 50%,
              rgba(112, 26, 117, 0.90) 100%
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.20),
            inset 0 -1px 0 rgba(0,0,0,0.45),
            0 1px 2px rgba(0,0,0,0.55),
            0 0 16px rgba(168, 85, 247, 0.45);
        }
        .badge-heartbreaker-text {
          background-image: linear-gradient(
            115deg,
            #67e8f9 0%,
            #c084fc 50%,
            #f0abfc 100%
          );
          background-size: 220% 100%;
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
          100% { background-position: 220% 50%; }
        }
      `}</style>
    </span>
  );
}
