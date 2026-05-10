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
  // (agent B populates 15 entries here)
};
// === END BADGES ===================================================================

// === NAME_FX (Agent C — cosmetics-name-fx branch) ================================
// Populate this block with 14 entries.
export const NAME_FX: Record<string, NameFxDef> = {
  'name.embossed-gold': {
    slug: 'name.embossed-gold',
    kind: 'name_fx',
    name: 'embossed gold',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/embossed-gold'),
    ) as NameFxComponent,
  },
  'name.carved-obsidian': {
    slug: 'name.carved-obsidian',
    kind: 'name_fx',
    name: 'carved obsidian',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/carved-obsidian'),
    ) as NameFxComponent,
  },
  'name.smoke-trail': {
    slug: 'name.smoke-trail',
    kind: 'name_fx',
    name: 'smoke trail',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/smoke-trail'),
    ) as NameFxComponent,
  },
  'name.frosted-glass': {
    slug: 'name.frosted-glass',
    kind: 'name_fx',
    name: 'frosted glass',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/frosted-glass'),
    ) as NameFxComponent,
  },
  'name.ink-bleed': {
    slug: 'name.ink-bleed',
    kind: 'name_fx',
    name: 'ink bleed',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/ink-bleed'),
    ) as NameFxComponent,
  },
  'name.pixelsort': {
    slug: 'name.pixelsort',
    kind: 'name_fx',
    name: 'pixelsort',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/pixelsort'),
    ) as NameFxComponent,
  },
  'name.aurora': {
    slug: 'name.aurora',
    kind: 'name_fx',
    name: 'aurora',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/aurora'),
    ) as NameFxComponent,
  },
  'name.signed': {
    slug: 'name.signed',
    kind: 'name_fx',
    name: 'signed',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/signed'),
    ) as NameFxComponent,
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
  'name.callout': {
    slug: 'name.callout',
    kind: 'name_fx',
    name: 'callout',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/callout'),
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
  'name.elo-king': {
    slug: 'name.elo-king',
    kind: 'name_fx',
    name: 'elo king',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/elo-king'),
    ) as NameFxComponent,
    smart: true,
  },
  'name.divine-judgment': {
    slug: 'name.divine-judgment',
    kind: 'name_fx',
    name: 'divine judgment',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/divine-judgment'),
    ) as NameFxComponent,
  },
  'name.score-overlay': {
    slug: 'name.score-overlay',
    kind: 'name_fx',
    name: 'score overlay',
    component: dynamic(
      () => import('@/components/cosmetics/name-fx/score-overlay'),
    ) as NameFxComponent,
    smart: true,
  },
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
