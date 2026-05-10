/**
 * Cosmetic registry — coded-component architecture.
 *
 * Each cosmetic is a React component under `components/cosmetics/{kind}/{slug}.tsx`.
 * This file maps slugs to their component imports + display config.
 *
 * Renderers (Frame / Badge / NameFx / ThemeAmbient) load the registered
 * component for an equipped slug and mount it with the appropriate
 * props.
 *
 * SMART cosmetics receive live user state via a `userStats` prop:
 *   - frame.streak-pyre, frame.scoreband
 *   - badge.tier-stamp
 *   - name.tier-prefix, name.callout, name.streak-flame, name.elo-king, name.score-overlay
 *   - theme.win-stack
 *
 * Adding a new item = 3 steps:
 *   1. Build the React component
 *   2. INSERT a row into catalog_items
 *   3. Add a registry entry to the matching fenced block below
 *
 * REGISTRY BLOCKS BELOW ARE OWNED BY DESIGN AGENTS:
 *   FRAMES   → Agent A (frames branch)
 *   BADGES   → Agent B (badges branch)
 *   NAME_FX  → Agent C (name-fx branch)
 *   THEMES   → Agent D (themes branch)
 *
 * Each agent edits ONLY their own block. The fenced comments are load-
 * bearing — do not remove them; they're the merge anchor.
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
 * different data available:
 *   - PublicProfileView: everything
 *   - Settings preview: everything
 *   - Leaderboard scan row: only bestScanOverall
 *   - Leaderboard battle row: elo + matchesWon
 *   - Battle tile: from LiveKit participant metadata
 *   - Follower / following list: everything
 *
 * Smart components must defensively render a sensible empty state
 * when fields are missing.
 */
export type UserStats = {
  elo?: number | null;
  bestScanOverall?: number | null;
  /** Consecutive wins. Same value powers `currentWinStreak` since the
   *  data model unifies them — see /api/battle/finish where
   *  current_streak is reset to 0 on loss and incremented on win. */
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
  /** Lazy-loaded React component implementing the frame. */
  component: FrameComponent;
  /** Pixels inset between the outer ring and the avatar content slot.
   *  Default 4. */
  ringInset?: number;
  /** Optional outer halo glow via box-shadow. */
  haloColor?: string;
  /** True if the component reads userStats. Used by render sites to
   *  decide whether they MUST pass userStats. */
  smart?: boolean;
};

export type BadgeDef = {
  slug: string;
  kind: 'badge';
  name: string;
  /** Lazy-loaded component. Default render size 22px; some surfaces
   *  request larger (e.g., store preview at 64px). */
  component: BadgeComponent;
  /** Title attribute / aria-label. */
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

// ---- Registry maps (split by kind, fenced for parallel-agent editing) ----

// === FRAMES (Agent A — cosmetics-frames branch) ==================================
// Populate this block with 16 entries. Each entry:
//   'frame.<slug>': {
//     slug: 'frame.<slug>',
//     kind: 'frame',
//     name: '<display name>',
//     component: dynamic(() => import('@/components/cosmetics/frames/<slug>')) as FrameComponent,
//     ringInset: <px>,
//     haloColor: 'rgba(...,0.30)',
//     smart: true, // only if the component reads userStats
//   },
export const FRAMES: Record<string, FrameDef> = {
  // (agent A populates 16 entries here)
};
// === END FRAMES ===================================================================

// === BADGES (Agent B — cosmetics-badges branch) ==================================
// Populate this block with 15 entries.
export const BADGES: Record<string, BadgeDef> = {
  'badge.ripple': {
    slug: 'badge.ripple',
    kind: 'badge',
    name: 'ripple',
    component: dynamic(
      () => import('@/components/cosmetics/badges/ripple'),
    ) as BadgeComponent,
    description: 'concentric water ripples expanding outward',
  },
  'badge.eclipse': {
    slug: 'badge.eclipse',
    kind: 'badge',
    name: 'eclipse',
    component: dynamic(
      () => import('@/components/cosmetics/badges/eclipse'),
    ) as BadgeComponent,
    description: 'total solar eclipse with corona flares licking outward',
  },
  'badge.match': {
    slug: 'badge.match',
    kind: 'badge',
    name: 'match',
    component: dynamic(
      () => import('@/components/cosmetics/badges/match'),
    ) as BadgeComponent,
    description: 'a single match igniting, burning down, regenerating',
  },
  'badge.tarot-back': {
    slug: 'badge.tarot-back',
    kind: 'badge',
    name: 'tarot back',
    component: dynamic(
      () => import('@/components/cosmetics/badges/tarot-back'),
    ) as BadgeComponent,
    description: 'sun and crescent moon stacked, gold on black',
  },
  'badge.compass': {
    slug: 'badge.compass',
    kind: 'badge',
    name: 'compass',
    component: dynamic(
      () => import('@/components/cosmetics/badges/compass'),
    ) as BadgeComponent,
    description: 'cardinal-direction rose with a drifting needle',
  },
  'badge.honeycomb': {
    slug: 'badge.honeycomb',
    kind: 'badge',
    name: 'honeycomb',
    component: dynamic(
      () => import('@/components/cosmetics/badges/honeycomb'),
    ) as BadgeComponent,
    description: 'hex cell with a slow gold liquid level rising and falling',
  },
  'badge.fractal': {
    slug: 'badge.fractal',
    kind: 'badge',
    name: 'fractal',
    component: dynamic(
      () => import('@/components/cosmetics/badges/fractal'),
    ) as BadgeComponent,
    description: 'algorithmic snowflake redrawing one branch at a time',
  },
  'badge.morse': {
    slug: 'badge.morse',
    kind: 'badge',
    name: 'morse',
    component: dynamic(
      () => import('@/components/cosmetics/badges/morse'),
    ) as BadgeComponent,
    description: 'three pulsing dots cycling a slow rhythmic morse pattern',
  },
  'badge.scan-1': {
    slug: 'badge.scan-1',
    kind: 'badge',
    name: 'first scan',
    component: dynamic(
      () => import('@/components/cosmetics/badges/scan-1'),
    ) as BadgeComponent,
    description: 'scanner reticle with corner brackets locking onto a center dot',
  },
  'badge.identity': {
    slug: 'badge.identity',
    kind: 'badge',
    name: 'identity',
    component: dynamic(
      () => import('@/components/cosmetics/badges/identity'),
    ) as BadgeComponent,
    description: 'face-profile silhouette with a single horizontal scan-line passing',
  },
  'badge.duelist': {
    slug: 'badge.duelist',
    kind: 'badge',
    name: 'duelist',
    component: dynamic(
      () => import('@/components/cosmetics/badges/duelist'),
    ) as BadgeComponent,
    description: 'two profile silhouettes facing each other in 1v1 stance',
  },
  'badge.king': {
    slug: 'badge.king',
    kind: 'badge',
    name: 'king',
    component: dynamic(
      () => import('@/components/cosmetics/badges/king'),
    ) as BadgeComponent,
    description: 'chess king piece with a faint pulsing aura',
  },
  'badge.tier-stamp': {
    slug: 'badge.tier-stamp',
    kind: 'badge',
    name: 'tier stamp',
    component: dynamic(
      () => import('@/components/cosmetics/badges/tier-stamp'),
    ) as BadgeComponent,
    description: 'your current tier letter stamped into the badge with crisp brand colors',
    smart: true,
  },
  'badge.holy-wordmark': {
    slug: 'badge.holy-wordmark',
    kind: 'badge',
    name: 'holy wordmark',
    component: dynamic(
      () => import('@/components/cosmetics/badges/holy-wordmark'),
    ) as BadgeComponent,
    description: 'the holymog wordmark inside a thin halo, slow gold rotation',
  },
  'badge.gavel': {
    slug: 'badge.gavel',
    kind: 'badge',
    name: 'gavel',
    component: dynamic(
      () => import('@/components/cosmetics/badges/gavel'),
    ) as BadgeComponent,
    description: 'a gavel mid-strike with a radial shockwave pulsing outward on impact',
  },
};
// === END BADGES ===================================================================

// === NAME_FX (Agent C — cosmetics-name-fx branch) ================================
// Populate this block with 14 entries.
export const NAME_FX: Record<string, NameFxDef> = {
  // (agent C populates 14 entries here)
};
// === END NAME_FX ==================================================================

// === THEMES (Agent D — cosmetics-themes branch) ==================================
// Populate this block with 15 entries.
export const THEMES: Record<string, ThemeDef> = {
  // (agent D populates 15 entries here)
};
// === END THEMES ===================================================================

/**
 * Slugs that read userStats. Render sites cross-reference this set
 * to decide whether to skip the smart cosmetic when stats are
 * unavailable (e.g., a leaderboard row that only knows the user's
 * elo cannot fully render `name.callout` which needs weakestSubScore).
 *
 * Populated by foundation agent based on the catalog spec §3.4.
 * Design agents do NOT modify this — it's the authoritative list.
 */
export const SMART_SLUGS: ReadonlySet<string> = new Set<string>([
  'frame.streak-pyre',
  'frame.scoreband',
  'badge.tier-stamp',
  'name.tier-prefix',
  'name.callout',
  'name.streak-flame',
  'name.elo-king',
  'name.score-overlay',
  'theme.win-stack',
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

/**
 * Used by dynamic imports — returns a component that renders the
 * appropriate cosmetic and falls back gracefully when the slug is
 * unknown (renders nothing) or the registry is empty (during
 * dev / pre-seed).
 */
export const _dynamic = dynamic;
