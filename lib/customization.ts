/**
 * Cosmetic registry — coded-component architecture.
 *
 * LAUNCH 1: ships 10 name fx, all achievement-gated, no monetization.
 * Frames, badges, and themes deferred to Launch 2 (with real designers).
 *
 * Each registered cosmetic is a React component under
 * `components/cosmetics/{kind}/{slug}.tsx`. Renderers (Frame / Badge /
 * NameFx / ThemeAmbient) load the component for an equipped slug and
 * mount it with the appropriate props.
 *
 * SMART cosmetics receive live user state via a `userStats` prop:
 *   - name.tier-prefix, name.callout, name.streak-flame, name.elo-king
 */

import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import type { SubScores } from '@/types';

/**
 * Live user state threaded through every cosmetic renderer. Smart
 * cosmetics read fields from this prop and modify their rendering;
 * non-smart cosmetics ignore it.
 *
 * All fields are optional + nullable because each render site has
 * different data available. Smart components must defensively render
 * a sensible empty state when fields are missing.
 */
export type UserStats = {
  elo?: number | null;
  bestScanOverall?: number | null;
  currentStreak?: number | null;
  currentWinStreak?: number | null;
  matchesWon?: number | null;
  weakestSubScore?: keyof SubScores | null;
};

// ---- Component signatures ------------------------------------------------

export type FrameComponent = ComponentType<{
  children: ReactNode;
  size: number;
  userStats?: UserStats;
}>;

export type BadgeComponent = ComponentType<{
  size: number;
  userStats?: UserStats;
}>;

export type NameFxComponent = ComponentType<{
  children: ReactNode;
  userStats?: UserStats;
}>;

export type ThemeComponent = ComponentType<{
  userStats?: UserStats;
}>;

// ---- Registry shape ------------------------------------------------------

export type FrameDef = {
  slug: string;
  kind: 'frame';
  name: string;
  component: FrameComponent;
  ringInset?: number;
  haloColor?: string;
  smart?: boolean;
};

export type BadgeDef = {
  slug: string;
  kind: 'badge';
  name: string;
  component: BadgeComponent;
  description: string;
  smart?: boolean;
};

export type NameFxDef = {
  slug: string;
  kind: 'name_fx';
  name: string;
  component: NameFxComponent;
  smart?: boolean;
};

export type ThemeDef = {
  slug: string;
  kind: 'theme';
  name: string;
  component: ThemeComponent;
  smart?: boolean;
};

export type Cosmetic = FrameDef | BadgeDef | NameFxDef | ThemeDef;
export type CosmeticKind = Cosmetic['kind'];

// ---- Registry maps -------------------------------------------------------

// Frames deferred to Launch 2 — every slot stays wired in the schema +
// API + renderer so designer assets plug in without a migration, but
// the registry is empty so no frame renders.
export const FRAMES: Record<string, FrameDef> = {};

// Badges deferred — collided visually with name fx. Slot stays in the
// data model for Launch 2 designer redesigns; registry is empty so no
// badge renders.
export const BADGES: Record<string, BadgeDef> = {};

// 10 name fx — varying difficulty curve, all achievement-gated.
export const NAME_FX: Record<string, NameFxDef> = {
  'name.signed': {
    slug: 'name.signed',
    kind: 'name_fx',
    name: 'signed',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/signed'),
    ) as NameFxComponent,
  },
  'name.callout': {
    slug: 'name.callout',
    kind: 'name_fx',
    name: 'callout',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/callout'),
    ) as NameFxComponent,
    smart: true,
  },
  'name.tier-prefix': {
    slug: 'name.tier-prefix',
    kind: 'name_fx',
    name: 'tier prefix',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/tier-prefix'),
    ) as NameFxComponent,
    smart: true,
  },
  'name.streak-flame': {
    slug: 'name.streak-flame',
    kind: 'name_fx',
    name: 'streak flame',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/streak-flame'),
    ) as NameFxComponent,
    smart: true,
  },
  'name.holographic': {
    slug: 'name.holographic',
    kind: 'name_fx',
    name: 'holographic',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/holographic'),
    ) as NameFxComponent,
  },
  'name.neon': {
    slug: 'name.neon',
    kind: 'name_fx',
    name: 'neon',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/neon'),
    ) as NameFxComponent,
  },
  'name.elo-king': {
    slug: 'name.elo-king',
    kind: 'name_fx',
    name: 'elo king',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/elo-king'),
    ) as NameFxComponent,
    smart: true,
  },
  'name.gilded': {
    slug: 'name.gilded',
    kind: 'name_fx',
    name: 'gilded',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/gilded'),
    ) as NameFxComponent,
  },
  'name.divine': {
    slug: 'name.divine',
    kind: 'name_fx',
    name: 'divine',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/divine'),
    ) as NameFxComponent,
  },
  'name.true-adam': {
    slug: 'name.true-adam',
    kind: 'name_fx',
    name: 'true adam',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/true-adam'),
    ) as NameFxComponent,
  },
  // Founder-only. Granted via SQL inventory insert, gated by
  // `founder_only` flag on catalog_items + the FOUNDER_ONLY_SLUGS
  // check below in the equip route.
  'name.founder': {
    slug: 'name.founder',
    kind: 'name_fx',
    name: 'founder',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/founder'),
    ) as NameFxComponent,
  },
};

/**
 * Slugs reserved for the founder. Two layers of defense:
 *   1. `catalog_items.founder_only = true` for these rows
 *   2. The equip route also rejects unless `user.id === FOUNDER_USER_ID`
 * That means even if a `user_inventory` row leaks to someone else
 * (manual SQL mistake, etc.), they still can't equip it.
 */
export const FOUNDER_ONLY_SLUGS: ReadonlySet<string> = new Set<string>([
  'name.founder',
]);

export function isFounderOnlySlug(slug: string): boolean {
  return FOUNDER_ONLY_SLUGS.has(slug);
}

// Themes deferred to Launch 2 — the tier-theme set was scrapped.
// Slot stays wired (DB column, ThemeAmbient renderer, equip API)
// so Launch 2 designer themes plug in without a schema change.
export const THEMES: Record<string, ThemeDef> = {};

/**
 * Slugs that read userStats. Render sites that lack the relevant
 * fields fall through to the empty-state branch inside each component.
 */
export const SMART_SLUGS: ReadonlySet<string> = new Set<string>([
  'name.callout',
  'name.tier-prefix',
  'name.streak-flame',
  'name.elo-king',
]);

// ---- Lookups --------------------------------------------------------------

export function getFrame(slug: string | null | undefined): FrameDef | null {
  if (!slug) return null;
  return FRAMES[slug] ?? null;
}

export function getBadge(slug: string | null | undefined): BadgeDef | null {
  if (!slug) return null;
  return BADGES[slug] ?? null;
}

export function getNameFx(slug: string | null | undefined): NameFxDef | null {
  if (!slug) return null;
  return NAME_FX[slug] ?? null;
}

export function getTheme(slug: string | null | undefined): ThemeDef | null {
  if (!slug) return null;
  return THEMES[slug] ?? null;
}

export function isValidItemSlug(slug: string): boolean {
  return (
    slug in FRAMES || slug in BADGES || slug in NAME_FX || slug in THEMES
  );
}

export function itemKindFromSlug(slug: string): CosmeticKind | null {
  if (slug in FRAMES) return 'frame';
  if (slug in BADGES) return 'badge';
  if (slug in NAME_FX) return 'name_fx';
  if (slug in THEMES) return 'theme';
  return null;
}

export const _dynamic = dynamic;
