# Agent D — Themes brief

You own all 15 theme cosmetic components for holymog. Build them in
this worktree, commit to the `cosmetics-themes` branch, then stop
and report back.

## Your scope (and only your scope)

- Create: `components/cosmetics/themes/{slug}.tsx` × 15
- Create: `app/dev/cosmetic-preview/sections/ThemesSection.tsx`
- Edit: ONLY the `=== THEMES ===` fenced block in `lib/customization.ts`.

Do NOT modify any file outside this list.

## How to start

1. Read `docs/superpowers/specs/2026-05-10-cosmetic-catalog.md` §
   Themes (15).
2. Read the per-theme notes in
   `docs/superpowers/plans/2026-05-10-cosmetic-full-build.md` Phase 10.
3. Foundation primitives available:
   - `components/cosmetics/ShaderCanvas.tsx` — for shader-based
     themes. Pass `context="fullscreen"` (NOT inline — themes are
     allowed solo, bypass the shader budget).
   - `components/cosmetics/glsl/*.ts` — noise/palette/sdf helpers.
   - `components/cosmetics/StaticFallback.tsx` — `context="fullscreen"`
     mode for reduced-motion fallback.
   - `lib/customization.ts` — `ThemeDef` + `UserStats` types.

## Component contract

Every theme is a React component with this signature:

```tsx
import type { UserStats } from '@/lib/customization';

export default function ThemeRain({
  userStats,  // OPTIONAL — only smart themes read it
}: {
  userStats?: UserStats;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      {/* the theme effect renders full-bleed here */}
    </div>
  );
}
```

Themes are full-bleed `position: fixed` elements behind the profile
content. They sit at `z-index: -10` so the profile content renders
above them. Always include `pointer-events: none` and `aria-hidden`.

## Smart themes

One theme in this kind reads `userStats`:

- **`theme.win-stack`** — reads `userStats.matchesWon`. Render a
  vertical column on one edge of the viewport with `min(matchesWon, 40)`
  stacked colored bars (each ~12px tall, tier-color cycling). On
  mount, new bars fade in from bottom with stagger. When matchesWon
  is null/0, render an empty column with a subtle hint.

## Per-theme specs (15 items)

See plan `Phase 10 — 15 themes` for full implementation per item:

| # | Slug | Tech | Smart? |
|---|---|---|---|
| 1 | `theme.rain` | shader | no |
| 2 | `theme.dust` | shader | no |
| 3 | `theme.spotlight` | shader | no |
| 4 | `theme.corridor` | create (SVG/CSS) | no |
| 5 | `theme.aurora` | shader | no |
| 6 | `theme.tidewave` | shader | no |
| 7 | `theme.granite` | shader | no |
| 8 | `theme.match-found` | create (SVG/CSS) | no |
| 9 | `theme.tier-grid` | create (SVG/CSS) | no |
| 10 | `theme.win-stack` | create (SVG/CSS) | YES |
| 11 | `theme.embers` | create (CSS particles) | no |
| 12 | `theme.god-beam` | shader | no |
| 13 | `theme.divine-rays` | shader | no |
| 14 | `theme.throne` | create (SVG) | no |
| 15 | `theme.shockwave` | shader | no |

Build order: shaders first (rain, dust, spotlight, aurora, tidewave,
granite, god-beam, divine-rays, shockwave) — they're more involved
and benefit from being done while you're warmed up on GLSL. Then the
6 SVG/CSS items.

## Registry block to populate

Add 15 entries to the `THEMES` map in `lib/customization.ts`:

```ts
'theme.rain': {
  slug: 'theme.rain',
  kind: 'theme',
  name: 'rain',
  component: dynamic(
    () => import('@/components/cosmetics/themes/rain'),
  ) as ThemeComponent,
},
```

`smart: true` for `theme.win-stack` ONLY.

## Preview section

Create `app/dev/cosmetic-preview/sections/ThemesSection.tsx`. Each
theme renders full-bleed by design, so wrap each preview in a
400×300 `relative overflow-hidden` box and mount the theme
component inside. Signature:

```tsx
import type { UserStats } from '@/lib/customization';

export function ThemesSection({ userStats }: { userStats: UserStats }) {
  // for each theme, render in a 400x300 framed preview box
}
```

Caveat: themes use `position: fixed` in production. For previews,
override with `position: absolute` via a wrapper class. The theme
components should respect their parent — i.e., use the renderer's
existing pattern that mounts them as fixed-positioned by default.
Use a clipping wrapper:

```tsx
<div className="relative h-[300px] w-[400px] overflow-hidden rounded-xl border border-white/10">
  <div className="absolute inset-0">
    <ThemeComponent />
  </div>
</div>
```

The component will use `position: fixed` but the clipping wrapper
constrains it visually. (Alternatively, the theme components could
read a `previewMode` prop — keep it simple and just clip.)

## Smoke gate

- All 15 render full-bleed in their preview boxes.
- Shader themes maintain ≥45fps on a modern laptop.
- `theme.win-stack` responds to `userStats.matchesWon` toggle.
- `prefers-reduced-motion` triggers static fallbacks for shader
  themes.
- `npx tsc --noEmit` clean (ignoring 3 pre-existing `stripe` errors).

## Stop conditions

- If a shader doesn't compile after 3 attempts, document in
  `## Blockers` section. Move on.
- Do NOT modify foundation files.

## Commit + report

```bash
git add components/cosmetics/themes \
        app/dev/cosmetic-preview/sections/ThemesSection.tsx \
        lib/customization.ts
git commit -m "themes: 15 cosmetic components"
```

Print:
```
done · 15 themes committed · all pass preview smoke · branch cosmetics-themes ready to merge
```
