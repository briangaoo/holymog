'use client';

import { getTheme, type UserStats } from '@/lib/customization';

/**
 * Full-bleed ambient layer behind the public profile. Loads the
 * registered theme component for the equipped slug.
 *
 * Renders nothing when slug is null/unknown so the existing tier-
 * coloured wash on PublicProfileView shows through as default.
 *
 * Smart themes (win-stack) read userStats. The single render site
 * for ThemeAmbient is PublicProfileView, which has all UserStats
 * fields available.
 */
export function ThemeAmbient({
  slug,
  userStats,
}: {
  slug: string | null | undefined;
  userStats?: UserStats;
}) {
  const def = getTheme(slug);
  if (!def) return null;
  const Component = def.component;
  return <Component userStats={userStats} />;
}
