# Agent A — Frames brief

You own all 16 frame cosmetic components for holymog. Build them in
this worktree, commit to the `cosmetics-frames` branch, then stop and
report back.

## Your scope (and only your scope)

- Create: `components/cosmetics/frames/{slug}.tsx` × 16
- Create: `app/dev/cosmetic-preview/sections/FramesSection.tsx`
- Edit: ONLY the `=== FRAMES ===` fenced block in `lib/customization.ts`
  — do not touch other blocks. The fence comments are merge anchors.

Do NOT modify any file outside this list. The foundation agent owns
everything else; design agents B/C/D own the other kinds.

## How to start

1. Read `docs/superpowers/specs/2026-05-10-cosmetic-catalog.md` §
   Frames (16) — the canonical spec for what each item looks like.
2. Read the per-frame implementation notes in
   `docs/superpowers/plans/2026-05-10-cosmetic-full-build.md` Phase 7
   — shader uniforms, SVG geometry, animation timing, fallbacks.
3. Skim the foundation primitives already in the repo:
   - `components/cosmetics/ShaderCanvas.tsx` — wrapper you mount for
     any GLSL-based frame. Pass `context="inline"`, `fragShader`,
     `fallback`, optional custom `uniforms`. It handles the GL
     lifecycle, RAF, context-loss, reduced-motion, shader-budget.
   - `components/cosmetics/glsl/noise.ts` — exports `NOISE_GLSL`
     string (snoise + fbm). Prepend to your fragment shader.
   - `components/cosmetics/glsl/palette.ts` — `palette()` IQ helper
     plus pre-baked palettes (PAL_SUNSET_*, PAL_GOLD_*, PAL_OBSIDIAN_*, etc.).
   - `components/cosmetics/glsl/sdf.ts` — circle/ring/segment SDFs
     + `bandSmooth` helper.
   - `components/cosmetics/StaticFallback.tsx` — pre-built reduced-motion
     fallback primitive (use `context="inline-ring"` for frames).
   - `lib/customization.ts` — read the `FrameDef` + `UserStats` types.
     The `FRAMES` map is your block.

## Component contract

Every frame is a React component with this signature:

```tsx
import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

export default function FrameLavaLamp({
  children,  // the avatar slot — render an inner content layer
  size,      // CSS px, will be 22/40/48/96/256 depending on surface
  userStats, // OPTIONAL — only smart frames read it
}: {
  children: ReactNode;
  size: number;
  userStats?: UserStats;
}) {
  return (
    <div className="absolute inset-0">
      {/* the cosmetic effect mounts here */}
      <div className="absolute overflow-hidden rounded-full"
           style={{ inset: 8 /* = ringInset */ }}>
        {children}
      </div>
    </div>
  );
}
```

The OUTER wrapper at `size × size` is already provided by `<Frame>`
in the renderer — you just render the cosmetic and the inner avatar
slot.

## Smart frames

Two frames in this kind read `userStats`:

- **`frame.streak-pyre`** — reads `userStats.currentStreak`. Scale flame
  intensity linearly from currentStreak ∈ [1, 30]. Set a uniform
  `u_intensity = clamp((currentStreak ?? 1) / 14, 0.5, 1.5)` and pass
  it to your shader via `uniforms`. When currentStreak is null, render
  with intensity = 0.5 (low flames).

- **`frame.scoreband`** — reads `userStats.bestScanOverall`. At
  `size >= 96`, render the score digits looping around the ring (SVG
  `<textPath>` along a circular `<path>`). At `size < 96`, render a
  static gold ring outline via `<StaticFallback context="inline-ring"
  color="#d4af37" ring />` — digits would be unreadable at small sizes.
  Slow rotation 40s/turn when size is large. When bestScanOverall is
  null, render static gold ring at all sizes.

## Per-frame specs (16 items)

See plan `Phase 7 — 16 frames` section in
`docs/superpowers/plans/2026-05-10-cosmetic-full-build.md` for the
detailed implementation per item:

| # | Slug | Tech | Smart? |
|---|---|---|---|
| 1 | `frame.lava-lamp` | shader | no |
| 2 | `frame.oil-slick` | shader | no |
| 3 | `frame.crt-scanline` | shader | no |
| 4 | `frame.mobius` | shader | no |
| 5 | `frame.cable` | create (SVG) | no |
| 6 | `frame.ferrofluid` | shader | no |
| 7 | `frame.torii` | create (SVG) | no |
| 8 | `frame.weather-front` | create (SVG) | no |
| 9 | `frame.scan-ring` | create (SVG) | no |
| 10 | `frame.elo-medal` | create (SVG) | no |
| 11 | `frame.streak-pyre` | shader | YES |
| 12 | `frame.canthal` | create (SVG) | no |
| 13 | `frame.crown-letters` | create (SVG) | no |
| 14 | `frame.scoreband` | create (SVG) | YES |
| 15 | `frame.heartbreaker` | create (SVG) | no |
| 16 | `frame.stained-glass` | shader | no |

Build order: shaders first (lava-lamp, oil-slick, crt-scanline,
mobius, ferrofluid, then streak-pyre + stained-glass), then SVG/CSS
items.

## Registry block to populate

Add 16 entries to the `FRAMES` map in `lib/customization.ts`,
between the `=== FRAMES ===` fence comments. Each entry:

```ts
'frame.lava-lamp': {
  slug: 'frame.lava-lamp',
  kind: 'frame',
  name: 'lava lamp',
  component: dynamic(
    () => import('@/components/cosmetics/frames/lava-lamp'),
  ) as FrameComponent,
  ringInset: 8,
  haloColor: 'rgba(249,115,22,0.30)',
},
```

`smart: true` for `frame.streak-pyre` and `frame.scoreband` ONLY.

## Preview section

Create `app/dev/cosmetic-preview/sections/FramesSection.tsx`. Render
each frame at sizes 48, 96, and 256 in a grid, with an inner avatar
placeholder. Read mock userStats from a prop so the foundation agent
can wire the global mock-stats toggle. Signature:

```tsx
import type { UserStats } from '@/lib/customization';

export function FramesSection({ userStats }: { userStats: UserStats }) {
  // render each frame at multiple sizes
}
```

## Smoke gate (must pass before committing)

For each of the 16 frames:
- Mounts in your `FramesSection` without console errors.
- Animation visibly runs (or fallback renders if reduced-motion).
- Smart frames respond when `userStats` changes between low/mid/high mock values.
- At 48px and 256px the cosmetic remains visually coherent.
- `npx tsc --noEmit` clean (ignoring the 3 pre-existing `stripe`
  module errors that clear on `npm install`).

## Stop conditions

- If a shader doesn't compile or run after 3 implementation attempts,
  stop and document the issue in a `## Blockers` section appended to
  this file. Move on to the next frame.
- If something requires foundation-owned files to change, stop — flag
  it. Do NOT modify foundation files yourself.

## Commit + report

After the smoke gate passes:

```bash
git add components/cosmetics/frames \
        app/dev/cosmetic-preview/sections/FramesSection.tsx \
        lib/customization.ts
git commit -m "frames: 16 cosmetic components"
```

(No Co-Authored-By trailer.)

Then print:
```
done · 16 frames committed · all pass preview smoke · branch cosmetics-frames ready to merge
```

Stop the session there. The foundation agent will merge your branch
into `main` and run integration verification.
