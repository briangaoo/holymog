# Agent B — Badges brief

You own all 15 badge cosmetic components for holymog. Build them in
this worktree, commit to the `cosmetics-badges` branch, then stop and
report back.

## Your scope (and only your scope)

- Create: `components/cosmetics/badges/{slug}.tsx` × 15
- Create: `app/dev/cosmetic-preview/sections/BadgesSection.tsx`
- Edit: ONLY the `=== BADGES ===` fenced block in `lib/customization.ts`.

Do NOT modify any file outside this list.

## How to start

1. Read `docs/superpowers/specs/2026-05-10-cosmetic-catalog.md` §
   Badges (15).
2. Read the per-badge implementation notes in
   `docs/superpowers/plans/2026-05-10-cosmetic-full-build.md` Phase 8.
3. Foundation primitives available:
   - `components/cosmetics/ShaderCanvas.tsx` — pass `context="inline"`,
     `fragShader`, `fallback`. Handles GL lifecycle automatically.
   - `components/cosmetics/glsl/noise.ts`, `palette.ts`, `sdf.ts` —
     prepend the exported strings into your fragment shader.
   - `components/cosmetics/StaticFallback.tsx` — for reduced-motion
     fallbacks. Use `context="inline-square"` for badges.
   - `lib/customization.ts` — `BadgeDef` + `UserStats` types live here.

## Component contract

Every badge is a React component with this signature:

```tsx
import type { UserStats } from '@/lib/customization';

export default function BadgeRipple({
  size,       // CSS px, will be 22 (inline) or 64 (store preview)
  userStats,  // OPTIONAL — only smart badges read it
}: {
  size: number;
  userStats?: UserStats;
}) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      {/* the badge effect mounts here */}
    </span>
  );
}
```

Badges are square, designed to read clearly at 22px and scale to
64px in the store preview. Hover: scale slightly via CSS transition.

## Smart badges

One badge in this kind reads `userStats`:

- **`badge.tier-stamp`** — reads `userStats.bestScanOverall`. Compute
  the tier via `getTier(bestScanOverall)` from `@/lib/tier`, then
  render the tier letter inside a square stamp. Tier color: gradient
  (cyan→purple) for S tiers (`tier.isGradient === true`), solid
  `tier.color` otherwise. When bestScanOverall is null, render a
  placeholder `?` letter.

## Per-badge specs (15 items)

See plan `Phase 8 — 15 badges` for detailed implementation per item:

| # | Slug | Tech | Smart? |
|---|---|---|---|
| 1 | `badge.ripple` | shader | no |
| 2 | `badge.eclipse` | shader | no |
| 3 | `badge.match` | shader | no |
| 4 | `badge.tarot-back` | create (SVG) | no |
| 5 | `badge.compass` | create (SVG) | no |
| 6 | `badge.honeycomb` | create (SVG) | no |
| 7 | `badge.fractal` | create (SVG) | no |
| 8 | `badge.morse` | create (SVG) | no |
| 9 | `badge.scan-1` | create (SVG) | no |
| 10 | `badge.identity` | create (SVG) | no |
| 11 | `badge.duelist` | create (SVG) | no |
| 12 | `badge.king` | create (SVG) | no |
| 13 | `badge.tier-stamp` | create (SVG) | YES |
| 14 | `badge.holy-wordmark` | create (SVG) | no |
| 15 | `badge.gavel` | shader | no |

Build order: shaders first (ripple, eclipse, match, gavel), then SVG.

## Registry block to populate

Add 15 entries to the `BADGES` map in `lib/customization.ts`, between
the `=== BADGES ===` fence comments. Each entry:

```ts
'badge.ripple': {
  slug: 'badge.ripple',
  kind: 'badge',
  name: 'ripple',
  component: dynamic(
    () => import('@/components/cosmetics/badges/ripple'),
  ) as BadgeComponent,
  description: 'concentric ripples expanding and fading',
},
```

`smart: true` for `badge.tier-stamp` ONLY.

## Preview section

Create `app/dev/cosmetic-preview/sections/BadgesSection.tsx`. Render
each badge at sizes 22 (inline) and 64 (store preview). Signature:

```tsx
import type { UserStats } from '@/lib/customization';

export function BadgesSection({ userStats }: { userStats: UserStats }) {
  // render each badge at multiple sizes
}
```

## Smoke gate

For each of the 15 badges:
- Mounts without console errors.
- Animation visibly runs (or fallback renders if reduced-motion).
- `badge.tier-stamp` shows correct tier letter when `userStats.bestScanOverall`
  changes between low/mid/high mock values.
- Readable at 22px (no fine detail under 4px).
- `npx tsc --noEmit` clean (ignoring 3 pre-existing `stripe` errors).

## Stop conditions

- If a shader doesn't compile after 3 attempts, document in a
  `## Blockers` section. Move on.
- Do NOT modify foundation files.

## Commit + report

```bash
git add components/cosmetics/badges \
        app/dev/cosmetic-preview/sections/BadgesSection.tsx \
        lib/customization.ts
git commit -m "badges: 15 cosmetic components"
```

Print:
```
done · 15 badges committed · all pass preview smoke · branch cosmetics-badges ready to merge
```
