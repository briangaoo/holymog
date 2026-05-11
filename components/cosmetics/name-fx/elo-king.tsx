'use client';

import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * `name.elo-king` — appends the user's current ELO as a small gold
 * superscript: briangao¹⁵²⁰. Falls back to just the name when ELO
 * isn't supplied at the render site.
 */
export default function NameEloKing({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const elo = userStats?.elo ?? null;
  if (elo === null || elo === undefined) {
    return <>{children}</>;
  }
  return (
    <span style={{ display: 'inline-block' }}>
      {children}
      <sup
        style={{
          marginLeft: '0.12em',
          fontSize: '0.55em',
          fontWeight: 800,
          color: '#fbbf24',
          letterSpacing: '0.04em',
          textShadow: '0 0 6px rgba(251,191,36,0.55)',
        }}
      >
        {elo}
      </sup>
    </span>
  );
}
