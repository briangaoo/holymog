import type { CSSProperties, ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';
import { getTier } from '@/lib/tier';

/**
 * Smart: reads `bestScanOverall` from userStats and renders the tier
 * letter (F-, F, F+, D-, … S, S+) immediately before the name.
 *
 * S-tier letters use the brand cyan→violet gradient via background-clip;
 * other tiers use a solid colour. Falls back to plain name if the score
 * is missing.
 */
export default function NameTierPrefix({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const score = userStats?.bestScanOverall;
  if (score == null) return <>{children}</>;

  const tier = getTier(score);
  const prefixStyle: CSSProperties = tier.isGradient
    ? {
        background: tier.color,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        fontWeight: 700,
      }
    : {
        color: tier.color,
        fontWeight: 700,
      };

  return (
    <>
      <span style={prefixStyle}>{tier.letter}</span>
      <span style={{ display: 'inline-block', width: '0.4em' }} />
      {children}
    </>
  );
}
