'use client';

import type { ReactNode } from 'react';

/**
 * `name.founder` — exclusive to the founder. A small gold "FOUNDER"
 * chip before the @handle, the handle itself in a deep-crimson-to-gold
 * gradient with a slow shimmer sweep, and a 4-point spark glyph after
 * the name (callback to the spark inside the `o` of the holymog
 * wordmark). Reduced-motion: shimmer + spark pulse both disable, static
 * gradient stays.
 *
 * Entitlement: gated by `user_inventory` ownership of `name.founder`
 * + `founder_only` flag on catalog_items. Not earnable through any
 * achievement, redemption, or purchase — granted via SQL only.
 */
export default function NameFounder({ children }: { children: ReactNode }) {
  return (
    <span
      className="name-fx-founder"
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}
    >
      <span className="name-fx-founder-chip" aria-hidden>
        FOUNDER
      </span>
      <span className="name-fx-founder-text">{children}</span>
      <span className="name-fx-founder-spark" aria-hidden>
        <svg
          viewBox="0 0 12 12"
          width="11"
          height="11"
          style={{
            display: 'inline-block',
            verticalAlign: 'baseline',
            transform: 'translateY(-1px)',
          }}
        >
          {/* 4-point star, same silhouette as the wordmark's `o`-spark. */}
          <path
            d="M6 0 L7.1 4.9 L12 6 L7.1 7.1 L6 12 L4.9 7.1 L0 6 L4.9 4.9 Z"
            fill="url(#name-fx-founder-spark-grad)"
          />
          <defs>
            <linearGradient
              id="name-fx-founder-spark-grad"
              x1="0"
              y1="0"
              x2="12"
              y2="12"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <style>{`
        .name-fx-founder {
          position: relative;
          isolation: isolate;
        }
        .name-fx-founder-chip {
          font-family: var(--font-mono-numeric), ui-monospace, monospace;
          font-size: 0.62em;
          font-weight: 800;
          letter-spacing: 0.14em;
          /* Body has text-transform: lowercase; force this chip to
             stay uppercase regardless of inherited rules. */
          text-transform: uppercase;
          padding: 2px 7px 2px 7px;
          border-radius: 9999px;
          color: #fef3c7;
          background: linear-gradient(135deg, #7c2d12 0%, #b45309 50%, #92400e 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 230, 170, 0.4),
            inset 0 -1px 0 rgba(0, 0, 0, 0.4),
            0 1px 4px rgba(180, 83, 9, 0.45);
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
          line-height: 1;
          position: relative;
          top: -0.05em;
        }
        .name-fx-founder-text {
          background: linear-gradient(
            180deg,
            #fef3c7 0%,
            #fbbf24 30%,
            #ea580c 65%,
            #991b1b 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-weight: 900;
          letter-spacing: -0.01em;
          filter:
            drop-shadow(0 1px 0 rgba(120, 53, 15, 0.5))
            drop-shadow(0 0 12px rgba(255,255,255, 0.25));
        }
        .name-fx-founder-spark {
          display: inline-flex;
          align-items: center;
          filter: drop-shadow(0 0 6px rgba(255,255,255, 0.65));
        }
        @media (prefers-reduced-motion: no-preference) {
          .name-fx-founder-text {
            background-image:
              linear-gradient(
                180deg,
                #fef3c7 0%,
                #fbbf24 30%,
                #ea580c 65%,
                #991b1b 100%
              ),
              linear-gradient(
                115deg,
                transparent 0%,
                transparent 42%,
                rgba(255, 250, 220, 0.85) 50%,
                transparent 58%,
                transparent 100%
              );
            background-size: 100% 100%, 220% 100%;
            background-position: 0 0, -220% 0;
            background-blend-mode: lighten;
            animation: name-fx-founder-shine 5.5s ease-in-out infinite;
          }
          .name-fx-founder-spark {
            animation: name-fx-founder-pulse 3.2s ease-in-out infinite;
          }
        }
        @keyframes name-fx-founder-shine {
          0%, 100% { background-position: 0 0, -220% 0; }
          55% { background-position: 0 0, 220% 0; }
        }
        @keyframes name-fx-founder-pulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 5px rgba(255,255,255, 0.55));
          }
          50% {
            transform: scale(1.15);
            filter: drop-shadow(0 0 11px rgba(255,255,255, 0.95));
          }
        }
      `}</style>
    </span>
  );
}
