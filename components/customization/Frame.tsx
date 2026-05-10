'use client';

import { getFrame, type UserStats } from '@/lib/customization';

/**
 * Frame renderer. Wraps an avatar (children) with the registered
 * frame component. When slug is null/unknown, renders just the
 * avatar inside a circular wrapper — keeps existing call sites
 * non-breaking.
 *
 * Public API unchanged: <Frame slug={...} size={...}>{avatar}</Frame>.
 * NEW: optional `userStats` prop for smart frames (streak-pyre,
 * scoreband). Render sites that have user stats should thread them.
 */
export function Frame({
  slug,
  size = 64,
  userStats,
  children,
  className = '',
}: {
  slug: string | null | undefined;
  size?: number;
  userStats?: UserStats;
  children: React.ReactNode;
  className?: string;
}) {
  const def = getFrame(slug);

  if (!def) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        {children}
      </div>
    );
  }

  const Component = def.component;
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Component size={size} userStats={userStats}>
        {children}
      </Component>
    </div>
  );
}
