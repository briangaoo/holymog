'use client';

import { getBadge, type UserStats } from '@/lib/customization';

/**
 * Badge renderer — small inline cosmetic icon next to a display name.
 * Loads the registered component for the slug and mounts it at the
 * given size (default 22px for inline contexts).
 *
 * Renders null for unknown slugs so call sites can render the badge
 * unconditionally and the badge silently no-ops when nothing is
 * equipped.
 *
 * Smart badges (tier-stamp) read userStats — pass it from render
 * sites that have user context.
 */
export function Badge({
  slug,
  size = 22,
  userStats,
}: {
  slug: string | null | undefined;
  size?: number;
  userStats?: UserStats;
}) {
  const def = getBadge(slug);
  if (!def) return null;
  const Component = def.component;
  return (
    <span
      title={def.description}
      aria-label={`badge: ${def.name}`}
      className="inline-flex flex-shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Component size={size} userStats={userStats} />
    </span>
  );
}
