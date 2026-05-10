# Cosmetic Overhaul — Design Spec

**Date:** 2026-05-10
**Status:** Design approved by user. Scaffold (everything except the products) ships today; products and registry population happen tomorrow.
**Authors:** brian gao, claude

---

## 1. Goal

Replace the current minimal cosmetic store with a Discord-style storefront fronting a new image-asset-based cosmetic system. The 12 existing simple CSS-driven cosmetics (`frame.gold-conic`, `frame.aurora`, `frame.ember`, `frame.void`, `frame.none`, `badge.founder`, `badge.beta`, `badge.s-tier`, `theme.default`, `theme.noir`, `theme.solar`, `theme.midnight`) get wiped. The replacement architecture treats every cosmetic as an image asset (PNG / MP4) generated externally on Higgsfield, dropped into a public Supabase Storage bucket, and referenced by a slug entry in the client-side registry.

**Today** ships the architecture: schema migration, types, API routes, registry skeleton, renderer scaffolding (image-based), settings UI, public profile wiring, and the Discord-style store page rewrite. The catalog is intentionally empty today — adding products tomorrow is one DB INSERT + one registry entry per item, no React changes.

**Tomorrow** generates the 26-item catalog: 8 frames @ $6, 8 badges @ $4, 5 name fx @ $8, 5 themes @ $10. All assets via Higgsfield. Pricing is flat per category — same price for every item in a category, regardless of design complexity.

## 2. Pricing

Flat per category. Premium aesthetic (no $3.99-style penny pricing).

| Category | Price | Count | Surface |
|---|---|---|---|
| Badges | $4 | 8 | ~28px pill next to display name |
| Frames | $6 | 8 | 80–140px ring around avatar |
| Name FX | $8 | 5 | display name treatment, applies everywhere |
| Themes | $10 | 5 | full-bleed ambient layer behind profile |

## 3. Asset model

All cosmetic visuals are hosted as static assets in Supabase Storage. New public-read bucket: `holymog-cosmetics`.

Per kind:
- **Frames** — transparent-center PNG sized to wrap the avatar. Renderer applies it as an absolute-positioned `<img>` overlay around a content slot containing the avatar.
- **Badges** — small square PNG (≥64×64 source, rendered at 20–28px) with transparency.
- **Name FX** — either an overlay PNG (e.g., sparkle layer composited via `mix-blend-mode: screen`) OR a registered CSS class. Registry entry per item declares which mode it uses. Defers per-item design choice to tomorrow without forcing a single approach.
- **Themes** — full-bleed cover asset. Either PNG (static) or MP4 (looping video). Registry declares `assetType: 'image' | 'video'`; renderer picks the right element. This dual support exists today; per-item asset choice happens tomorrow.

## 4. Registry (`lib/customization.ts`)

Single `Cosmetic` discriminated-union type. Four named maps (frames, badges, nameFx, themes), each starts **empty** today. Tomorrow each item is one entry. Adding an item requires uploading the asset and adding the registry line — no new component code.

```ts
type FrameDef = {
  slug: string;
  kind: 'frame';
  name: string;
  imageUrl: string;
  /** px between ring image edge and avatar content. default 4. */
  ringInset?: number;
  /** Optional CSS color for outer halo via box-shadow. */
  haloColor?: string;
};

type BadgeDef = {
  slug: string;
  kind: 'badge';
  name: string;
  imageUrl: string;
  description: string;
};

type NameFxDef = {
  slug: string;
  kind: 'name_fx';
  name: string;
  /** CSS class applied to the text span. Mutually exclusive with imageUrl. */
  cssClass?: string;
  /** Overlay image composited over the text via mix-blend-mode. */
  imageUrl?: string;
};

type ThemeDef = {
  slug: string;
  kind: 'theme';
  name: string;
  assetType: 'image' | 'video';
  imageUrl?: string;   // when assetType === 'image'
  videoUrl?: string;   // when assetType === 'video'
};

export const FRAMES: Record<string, FrameDef> = {};
export const BADGES: Record<string, BadgeDef> = {};
export const NAME_FX: Record<string, NameFxDef> = {};
export const THEMES: Record<string, ThemeDef> = {};
```

Lookup helpers (`getFrame`, `getBadge`, `getNameFx`, `getTheme`, `isValidItemSlug`, `itemKindFromSlug`) return `null` for unknown slugs. Renderers gracefully render nothing when slug is unknown.

## 5. Renderers

Four small components, each ~30 lines.

`components/customization/Frame.tsx`:
- Wrap `children` in a `<div>` sized to `size` prop
- Inner content slot: `<div className="absolute overflow-hidden rounded-full" style={{inset: ringInset}}>{children}</div>`
- Ring image: `<img>` absolutely positioned filling the wrapper
- Halo: outer `box-shadow` driven by `haloColor` if defined
- Unknown slug → render bare avatar wrapper (no ring, no halo)

`components/customization/Badge.tsx`:
- Render `<img>` at 20–22px next to display name
- Unknown slug → `null`

`components/customization/NameFx.tsx` (new):
- Wrap text node in `<span>` with `position: relative`, `display: inline-block`
- If `cssClass` set → apply class to wrapper
- If `imageUrl` set → overlay `<img>` absolutely on top with `mix-blend-mode: screen`
- Unknown slug → render `children` unchanged

`components/customization/ThemeAmbient.tsx` (new):
- Renders fixed full-viewport asset at `z-index: 0`, `pointer-events: none`
- `assetType: 'image'` → `<img className="fixed inset-0 -z-10 h-full w-full object-cover">`
- `assetType: 'video'` → `<video autoPlay loop muted playsInline>` with `<source>`
- Unknown slug → `null`

## 6. Schema migration

`docs/migrations/2026-05-10-cosmetic-overhaul.sql`:

1. Drop existing `catalog_items_kind_check` constraint, recreate with `name_fx` added to enum
2. `alter table profiles add column if not exists equipped_name_fx text`
3. `delete from user_inventory; delete from catalog_items;` — clean slate (pre-launch, no real users)
4. Create `holymog-cosmetics` storage bucket with `public = true`, allowed mime types `image/png`, `image/jpeg`, `image/webp`, `video/mp4`, file size limit 10MB

The `equipped_flair`, `equipped_theme`, `equipped_frame` columns stay (they back the old badge/theme/frame slots). Adding `equipped_name_fx` makes 4 slots total.

## 7. API routes

`app/api/account/equip/route.ts`:
- Accept slug, look up `kind` via `itemKindFromSlug`
- Map `kind === 'name_fx'` → write to `equipped_name_fx`
- Existing mappings stay: `frame` → `equipped_frame`, `theme` → `equipped_theme`, `badge` → `equipped_flair`

`app/api/account/unequip/route.ts`:
- Accept `body.kind` ∈ `{frame, theme, flair, name_fx}`
- Same column mapping as above

`app/api/account/me/route.ts` GET:
- Add `equipped_name_fx` to the SELECT and the `Profile` type

`app/api/account/me/route.ts` PATCH: no change. Equipped name fx is changed only through `/api/account/equip`, not via the settings PATCH.

`lib/publicProfile.ts`:
- Add `equipped_name_fx: string | null` to `PublicProfileData`
- Include `p.equipped_name_fx` in the SELECT

## 8. Type plumbing

`components/account/settings/shared.tsx`:
- `SettingsProfile.equipped_name_fx: string | null`

`app/account/page.tsx`:
- `MeData.profile.equipped_name_fx: string | null`

## 9. Settings UI

`components/account/settings/CustomizationSection.tsx` — add a 4th row for "name fx" alongside frame/badge/theme. Same row pattern. Reads `profile.equipped_name_fx`, calls `getNameFx(slug)` for the title display.

## 10. Public profile wiring

`components/PublicProfileView.tsx`:
- At the top of the returned JSX, before the existing theme wash, render `<ThemeAmbient slug={data.equipped_theme} />` as a fixed full-bleed background
- Wrap the H1 display name with `<NameFx slug={data.equipped_name_fx}>{data.display_name}</NameFx>`

The existing weak theme wash gradient stays as a fallback when no theme is equipped — themes are expensive and most users won't have one.

## 11. Store page rewrite

`app/account/store/page.tsx` — full rewrite matching the Discord-style layout the user approved.

Layout:
- Header row: ← back button · "store" h1 · "flat pricing · $4 → $10" eyebrow on the right
- Tab bar: 4 pills in a single rounded container — frames ($6), badges ($4), name fx ($8), themes ($10). Active pill = white fill, black text. Inactive = transparent, zinc text. Each pill carries a small price chip.
- Section head per tab: "frames · avatar rings" with "N items" count on the right
- Card grid: `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, gap 14–16px
- Card body:
  - Live preview area (140–180px, radial wash bg) — actually renders the cosmetic via the registry, not a static screenshot
  - Item name (14px bold)
  - Description (12px zinc)
  - Footer separated by hairline: "not owned" / "owned" / "✓ equipped" state pill + price button (`$X` for buy, "equip" for owned, "unequip" for equipped)
- Hover lift: `transform: translateY(-3px)` + border lighten + drop shadow
- Empty state per tab: "no items in this category yet · check back soon" centered card when registry map is empty (which is the case for every category today)

Existing flow handlers stay (`/api/account/equip` for owned-but-not-equipped → equip, `/api/checkout/create-session` for paid+not owned → Stripe redirect). Click pattern unchanged.

## 12. Sequencing

1. Migration SQL (user runs in Supabase Studio)
2. `lib/customization.ts` rewrite (empty registries)
3. `lib/publicProfile.ts` add equipped_name_fx
4. Renderer scaffolding (Frame, Badge, NameFx, ThemeAmbient)
5. Type plumbing (`SettingsProfile`, `MeData`)
6. API route extensions
7. `CustomizationSection` 4th row
8. `PublicProfileView` theme + name fx wire-up
9. Store page rewrite
10. `npx tsc --noEmit` clean
11. Commit

## 13. Out of scope (today)

- Product designs themselves (deferred to tomorrow's Higgsfield session)
- Asset upload tooling — for tomorrow, manual drag-and-drop into Supabase Studio is fine for 26 assets
- Animated frames or themes via CSS/SVG — replaced by the image/video asset model
- Fallback/default cosmetic — if a user has nothing equipped, no frame/badge/name fx/theme renders. This is a deliberate change; the previous "frame.none" auto-grant goes away with the catalog wipe

## 14. Acceptance criteria (today)

The scaffold is considered done when:

1. Migration runs cleanly in Supabase Studio with no errors
2. `npx tsc --noEmit` is clean
3. `/account/store` renders the Discord-style 4-tab layout with empty-state cards in every tab
4. Settings → Customization shows 4 rows (frame, badge, theme, name fx)
5. `/api/account/me` returns `equipped_name_fx` (null until tomorrow)
6. `/api/account/equip` and `/api/account/unequip` accept `name_fx` kind
7. `PublicProfileView` renders `<ThemeAmbient>` and `<NameFx>` with no errors when slugs are null/unknown
8. No regressions on existing surfaces (battle tiles, leaderboard rows, follower lists) — they continue to render avatars without frames/badges since registries are empty

## 15. Tomorrow's checklist (deferred)

- Generate 26 cosmetic assets via Higgsfield (8 frames + 8 badges + 5 name fx + 5 themes)
- Upload to `holymog-cosmetics` bucket
- Add 26 INSERT rows to a new migration `2026-05-11-cosmetic-catalog-seed.sql`
- Add 26 entries to `FRAMES` / `BADGES` / `NAME_FX` / `THEMES` maps in `lib/customization.ts`
- Smoke test: equip + unequip each item; verify visual rendering on profile, store card preview, battle tile (frames + badges only), leaderboard rows
