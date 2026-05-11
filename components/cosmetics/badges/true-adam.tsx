'use client';

/**
 * S+ tier badge — "true adam". The marquee. Deep iridescent pill
 * with sparkle prefix + animated gradient text cycling through
 * cyan → purple → pink → gold. Strongest halo glow of any badge.
 */
export default function BadgeTrueAdam({ size }: { size: number }) {
  return (
    <span className="badge-true-adam">
      <span className="badge-true-adam-spark" aria-hidden>
        ✦
      </span>
      <span className="badge-true-adam-text">true adam</span>
      <style>{`
        .badge-true-adam {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.32em;
          height: 100%;
          padding: 0 0.9em;
          font-size: ${size * 0.5}px;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: lowercase;
          white-space: nowrap;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(253, 224, 71, 0.6);
          background:
            linear-gradient(
              115deg,
              rgba(8, 47, 73, 0.92) 0%,
              rgba(76, 29, 149, 0.92) 45%,
              rgba(120, 53, 15, 0.92) 100%
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            inset 0 -1px 0 rgba(0, 0, 0, 0.45),
            0 1px 2px rgba(0,0,0,0.55),
            0 0 18px rgba(168, 85, 247, 0.50),
            0 0 32px rgba(253, 224, 71, 0.28);
        }
        .badge-true-adam-spark {
          color: #fde047;
          text-shadow:
            0 0 6px rgba(253, 224, 71, 0.95),
            0 0 12px rgba(253, 224, 71, 0.55);
          font-size: 0.95em;
        }
        .badge-true-adam-text {
          background-image: linear-gradient(
            115deg,
            #67e8f9 0%,
            #c084fc 38%,
            #f0abfc 70%,
            #fde047 100%
          );
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter:
            drop-shadow(0 0 5px rgba(168, 85, 247, 0.55))
            drop-shadow(0 0 10px rgba(253, 224, 71, 0.30));
        }
        @media (prefers-reduced-motion: no-preference) {
          .badge-true-adam-text {
            animation: ta-shimmer 6s linear infinite;
          }
          .badge-true-adam-spark {
            animation: ta-spark 2.4s ease-in-out infinite;
          }
        }
        @keyframes ta-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 250% 50%; }
        }
        @keyframes ta-spark {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.85; }
          50% { transform: scale(1.2) rotate(20deg); opacity: 1; }
        }
      `}</style>
    </span>
  );
}
