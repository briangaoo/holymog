# Agent C — Name FX brief

You own all 14 name-fx cosmetic components for holymog. Build them in
this worktree, commit to the `cosmetics-name-fx` branch, then stop
and report back.

## Your scope (and only your scope)

- Create: `components/cosmetics/name-fx/{slug}.tsx` × 14
- Create: `app/dev/cosmetic-preview/sections/NameFxSection.tsx`
- Edit: ONLY the `=== NAME_FX ===` fenced block in `lib/customization.ts`
- Edit: `app/globals.css` ONLY to add a single fenced block of CSS
  classes (one per `create`-tech name fx that uses a CSS class). The
  block must be marked with comment fences `/* === NAME_FX CLASSES ===
  ... === END NAME_FX CLASSES === */` so the foundation agent can
  spot it during merge.

Do NOT modify any file outside this list.

## How to start

1. Read `docs/superpowers/specs/2026-05-10-cosmetic-catalog.md` §
   Name FX (14).
2. Read the per-item notes in
   `docs/superpowers/plans/2026-05-10-cosmetic-full-build.md` Phase 9.
3. Foundation primitives available:
   - `components/cosmetics/ShaderCanvas.tsx` — for shader-overlay
     name fx (smoke-trail, ink-bleed, divine-judgment). Mount as an
     `position: absolute; inset: 0; pointer-events: none` layer above
     the text with `mix-blend-mode: screen`. Pass `context="inline"`.
   - `components/cosmetics/glsl/*.ts` — noise/palette/sdf helpers.
   - `lib/customization.ts` — `NameFxDef` + `UserStats` types.
   - `lib/tier.ts` — `getTier(score)` for `name.tier-prefix`.

## Component contract

Every name-fx is a React component with this signature:

```tsx
import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

export default function NameAurora({
  children,    // the display-name text
  userStats,   // OPTIONAL — only smart name fx read it
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  return (
    <span className="name-fx-aurora">
      {children}
    </span>
  );
}
```

Three rendering modes:

1. **CSS-only**: wrap children in a `<span>` with a class defined in
   `app/globals.css` (your fenced block). Examples: embossed-gold,
   carved-obsidian, frosted-glass, pixelsort, aurora.

2. **Shader overlay**: render text + `<ShaderCanvas>` layered on top.
   Use `position: relative` on the wrapper + absolute positioning on
   the canvas with `mix-blend-mode: screen`. Examples: smoke-trail,
   ink-bleed, divine-judgment.

3. **Smart (data-binding)**: read `userStats` and modify the rendered
   output (prefix/suffix/wrap). No animation needed. Examples:
   tier-prefix, callout, streak-flame, elo-king, score-overlay.

## Smart name fx (5 items)

- **`name.tier-prefix`** — reads `bestScanOverall`. Render
  `<span>{getTier(bestScanOverall).letter} </span>{children}`. Tier
  letter colored per tier (gradient via inline style for S tiers).
  If `bestScanOverall` is null/undefined, render just `{children}`.

- **`name.callout`** — reads `weakestSubScore`. Render
  `{children} <span>({weakestSubScore})</span>` with the suffix in
  muted gray. If `weakestSubScore` is null/undefined, render just
  `{children}`.

- **`name.streak-flame`** — reads `currentWinStreak`. If
  `currentWinStreak >= 1`, render `{children} <span>{streak}🔥</span>`.
  Otherwise render just `{children}`.

- **`name.elo-king`** — reads `elo`. If `elo` is set, render
  `{children}<sup style={{ fontSize: '0.6em', color: '#38bdf8' }}>{elo}</sup>`.
  Otherwise render just `{children}`.

- **`name.score-overlay`** — reads `bestScanOverall`. Wrap children
  with an absolutely-positioned `<span>` above the text showing the
  score in tiny gold digits. If null, render just `{children}`.

## Per-item specs (14)

See plan `Phase 9 — 14 name fx` for full implementation per item:

| # | Slug | Tech | Smart? |
|---|---|---|---|
| 1 | `name.embossed-gold` | css-only | no |
| 2 | `name.carved-obsidian` | css-only | no |
| 3 | `name.smoke-trail` | shader overlay | no |
| 4 | `name.frosted-glass` | css-only | no |
| 5 | `name.ink-bleed` | shader overlay | no |
| 6 | `name.pixelsort` | css-only | no |
| 7 | `name.aurora` | css-only | no |
| 8 | `name.signed` | SVG underline | no |
| 9 | `name.tier-prefix` | data-binding | YES |
| 10 | `name.callout` | data-binding | YES |
| 11 | `name.streak-flame` | data-binding | YES |
| 12 | `name.elo-king` | data-binding | YES |
| 13 | `name.divine-judgment` | shader overlay | no |
| 14 | `name.score-overlay` | data-binding | YES |

## Registry block to populate

Add 14 entries to the `NAME_FX` map in `lib/customization.ts`:

```ts
'name.aurora': {
  slug: 'name.aurora',
  kind: 'name_fx',
  name: 'aurora',
  component: dynamic(
    () => import('@/components/cosmetics/name-fx/aurora'),
  ) as NameFxComponent,
},
```

`smart: true` on the 5 smart slugs above ONLY.

## CSS classes in globals.css

Append a fenced block to `app/globals.css`:

```css
/* === NAME_FX CLASSES (agent C — cosmetics-name-fx branch) === */
.name-fx-embossed-gold {
  background: linear-gradient(135deg, #fef3c7, #d4af37, #92400e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 1px 0 rgba(255,255,255,0.5))
          drop-shadow(0 2px 3px rgba(0,0,0,0.6));
}

.name-fx-aurora {
  background: linear-gradient(90deg, #22d3ee, #a855f7, #84cc16, #f97316, #22d3ee);
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: name-fx-aurora-cycle 8s linear infinite;
}
@keyframes name-fx-aurora-cycle {
  0% { background-position: 0% 50%; }
  100% { background-position: 400% 50%; }
}

/* ... (remaining classes for carved-obsidian, frosted-glass, pixelsort) */
/* === END NAME_FX CLASSES === */
```

Honor `prefers-reduced-motion` — wrap animations in
`@media (prefers-reduced-motion: no-preference) { ... }` blocks.

## Preview section

Create `app/dev/cosmetic-preview/sections/NameFxSection.tsx`. Render
each name fx wrapping the text "briangao" at a representative size
(e.g., 24px). Signature:

```tsx
import type { UserStats } from '@/lib/customization';

export function NameFxSection({ userStats }: { userStats: UserStats }) {
  // render each name fx wrapping "briangao"
}
```

## Smoke gate

- All 14 wrap the test text correctly.
- CSS-only name fx animate; shader overlays render; smart items
  mutate based on `userStats` toggle.
- Pixel sort doesn't break layout.
- `npx tsc --noEmit` clean (ignoring 3 pre-existing `stripe` errors).

## Commit + report

```bash
git add components/cosmetics/name-fx \
        app/dev/cosmetic-preview/sections/NameFxSection.tsx \
        lib/customization.ts \
        app/globals.css
git commit -m "name-fx: 14 cosmetic components"
```

Print:
```
done · 14 name fx committed · all pass preview smoke · branch cosmetics-name-fx ready to merge
```
