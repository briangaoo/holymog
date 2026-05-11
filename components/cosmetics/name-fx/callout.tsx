'use client';

import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * `name.callout` — appends the user's weakest sub-score in muted
 * parens after the name: "briangao (jawline)". Pure data binding,
 * no animation. Renders just the name unchanged when weakest
 * sub-score is unavailable (no scan yet, or render site lacks it).
 */
export default function NameCallout({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const weak = userStats?.weakestSubScore ?? null;
  return (
    <span style={{ display: 'inline-block' }}>
      {children}
      {weak && (
        <span
          style={{
            marginLeft: '0.4em',
            color: 'rgba(161, 161, 170, 0.75)',
            fontWeight: 500,
            fontSize: '0.78em',
            verticalAlign: 'baseline',
          }}
        >
          ({weak})
        </span>
      )}
    </span>
  );
}
