'use client';

import { getBadge, type UserStats } from '@/lib/customization';

/**
 * Badge renderer — text pill next to a display name (Discord-verified
 * style). Width flows from the badge's content; only the height is
 * driven by the `size` prop so badges inline cleanly with text.
 *
 * Renders null for unknown slugs so call sites can render the badge
 * unconditionally and the badge silently no-ops when nothing is
 * equipped.
 */
export function Badge({
  slug,
  size = 44,
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
      style={{ height: size }}
    >
      <Component size={size} userStats={userStats} />
    </span>
  );
}
