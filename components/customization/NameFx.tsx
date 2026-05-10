'use client';

import { getNameFx, type UserStats } from '@/lib/customization';

/**
 * Display-name treatment. Wraps the name text in the registered
 * component for the equipped slug.
 *
 * When slug is null/unknown, renders children unchanged so call
 * sites can wrap unconditionally with no DOM cost.
 *
 * Smart name fx (tier-prefix, callout, streak-flame, elo-king,
 * score-overlay) read userStats. Pass userStats from render sites
 * that have user context — leaderboard rows, profile, battle tiles,
 * follower lists, settings preview.
 */
export function NameFx({
  slug,
  userStats,
  children,
  className = '',
}: {
  slug: string | null | undefined;
  userStats?: UserStats;
  children: React.ReactNode;
  className?: string;
}) {
  const def = getNameFx(slug);
  if (!def) {
    return className ? <span className={className}>{children}</span> : <>{children}</>;
  }
  const Component = def.component;
  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <Component userStats={userStats}>{children}</Component>
    </span>
  );
}
