'use client';

/**
 * S+ tier badge — "true adam". The marquee badge. Gradient pill with
 * a halo glow + a sparkle char prefix. Slow shimmer cycles through
 * cyan → purple → pink → gold.
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
          gap: 0.35em;
          height: 100%;
          padding: 0 0.85em;
          font-size: ${size * 0.5}px;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: lowercase;
          white-space: nowrap;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(253, 224, 71, 0.55);
          background:
            radial-gradient(
              ellipse at top left,
              rgba(34, 211, 238, 0.28) 0%,
              rgba(168, 85, 247, 0.25) 45%,
              rgba(253, 224, 71, 0.18) 100%
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            0 0 14px rgba(168, 85, 247, 0.45),
            0 0 28px rgba(253, 224, 71, 0.25);
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
            #a855f7 38%,
            #ec4899 70%,
            #fde047 100%
          );
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter:
            drop-shadow(0 0 5px rgba(168, 85, 247, 0.55))
            drop-shadow(0 0 10px rgba(34, 211, 238, 0.30));
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
