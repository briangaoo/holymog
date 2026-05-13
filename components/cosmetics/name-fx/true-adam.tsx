'use client';

import type { ReactNode } from 'react';

/**
 * `name.true-adam` — the marquee name fx. S+ cyan→purple gradient
 * letterforms with a slow white shimmer-pulse + a ✦ glyph prefix
 * that hangs subtly in front of the name. The peak flex.
 */
export default function NameTrueAdam({ children }: { children: ReactNode }) {
  return (
    <span className="name-fx-true-adam" style={{ display: 'inline-block' }}>
      <span className="name-fx-true-adam-spark" aria-hidden>
        ✦
      </span>
      <span className="name-fx-true-adam-text">{children}</span>
      <style>{`
        .name-fx-true-adam {
          position: relative;
          isolation: isolate;
        }
        .name-fx-true-adam-spark {
          display: inline-block;
          margin-right: 0.32em;
          font-size: 0.85em;
          color: #fde047;
          text-shadow:
            0 0 8px rgba(253,224,71,0.95),
            0 0 16px rgba(253,224,71,0.55);
          vertical-align: 0.05em;
        }
        .name-fx-true-adam-text {
          background-image: linear-gradient(
            115deg,
            #22d3ee 0%,
            #67e8f9 22%,
            #a855f7 55%,
            #ec4899 82%,
            #22d3ee 100%
          );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 900;
          letter-spacing: -0.015em;
          filter: drop-shadow(0 0 8px rgba(255,255,255,0.45))
                  drop-shadow(0 0 20px rgba(255,255,255,0.30));
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-true-adam-text {
            animation: name-fx-true-adam-cycle 7s linear infinite;
          }
          .name-fx-true-adam-spark {
            animation: name-fx-true-adam-spark-pulse 2.8s ease-in-out infinite;
          }
        }
        @keyframes name-fx-true-adam-cycle {
          0% { background-position: 0% 50%; }
          100% { background-position: 220% 50%; }
        }
        @keyframes name-fx-true-adam-spark-pulse {
          0%, 100% {
            opacity: 0.85;
            transform: scale(1) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.15) rotate(15deg);
          }
        }
      `}</style>
    </span>
  );
}
