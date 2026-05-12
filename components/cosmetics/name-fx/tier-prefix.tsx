'use client';

import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';
import { getTier } from '@/lib/tier';

/**
 * `name.tier-prefix` — current best-scan tier letter precedes the
 * name, colored to its tier band. "S+ briangao", "A briangao", etc.
 * Falls back to just the name when no scan is on record.
 */
export default function NameTierPrefix({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const score = userStats?.bestScanOverall ?? null;
  if (score === null || score === undefined) {
    return <>{children}</>;
  }
  const tier = getTier(score);
  const letterStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textShadow: tier.glow ? '0 0 12px rgba(168,85,247,0.45)' : undefined,
      }
    : { color: tier.color };

  return (
    <span style={{ display: 'inline-block' }}>
      <span
        className="uppercase"
        style={{
          marginRight: '0.45em',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          ...letterStyle,
          textTransform: 'uppercase',
        }}
      >
        {tier.letter}
      </span>
      {children}
    </span>
  );
}
