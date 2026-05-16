'use client';

import type { ReactNode } from 'react';

/**
 * `name.founder` — exclusive to the founder. A small gold "FOUNDER"
 * chip before the @handle and the handle itself in a deep-crimson-to-
 * gold gradient with a slow shimmer sweep. Reduced-motion: shimmer
 * disables, static gradient stays.
 *
 * Earlier cuts had a 4-point spark glyph after the name + an amber
 * drop-shadow halo on the text, but the halo bled out and made the
 * surrounding area read as a coloured background (especially against
 * the brutalist black surfaces this app commits to), and the spark
 * got clipped on narrow containers because the inline-flex wouldn't
 * wrap. Both removed.
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
            inset 0 -1px 0 rgba(0, 0, 0, 0.4);
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
        }
        @keyframes name-fx-founder-shine {
          0%, 100% { background-position: 0 0, -220% 0; }
          55% { background-position: 0 0, 220% 0; }
        }
      `}</style>
    </span>
  );
}
