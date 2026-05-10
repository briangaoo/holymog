# Cosmetic Overhaul — Implementation Plan

> Spec: [`../specs/2026-05-10-cosmetic-overhaul-design.md`](../specs/2026-05-10-cosmetic-overhaul-design.md)

**Goal:** Ship the entire image-asset-based cosmetic architecture (schema, types, API, renderers, settings, store UI) today. Products + registry population deferred to tomorrow.

**Architecture:** Cosmetics become Higgsfield-generated image (or video) assets in the `holymog-cosmetics` Supabase Storage bucket. Per-slug registry entries in `lib/customization.ts` map slug → asset URL + display config. Renderers (`<Frame>`, `<Badge>`, `<NameFx>`, `<ThemeAmbient>`) just render `<img>` or `<video>` with positioning. Adding tomorrow's products is registry-only — no React changes.

**Tech stack:** Next.js 16 App Router, React 19.2, TypeScript strict, Supabase Postgres + Storage, Tailwind v4.

---

## Task 1: Migration SQL

**Files:**
- Create: `docs/migrations/2026-05-10-cosmetic-overhaul.sql`

- [ ] Write migration that:
  - Drops + recreates `catalog_items_kind_check` to include `name_fx`
  - Adds `equipped_name_fx text` to `profiles`
  - Wipes `user_inventory` and `catalog_items` (pre-launch clean slate)
  - Creates `holymog-cosmetics` storage bucket (public-read, 10MB limit, png/jpeg/webp/mp4)
  - User runs manually in Supabase Studio after PR lands

## Task 2: Registry rewrite

**Files:**
- Modify: `lib/customization.ts`

- [ ] Replace existing FRAMES/BADGES/THEMES with new Cosmetic union shape per spec §4
- [ ] Add `NAME_FX: Record<string, NameFxDef>` (empty)
- [ ] All four maps start empty
- [ ] Lookup helpers: `getFrame`, `getBadge`, `getNameFx`, `getTheme`, `isValidItemSlug`, `itemKindFromSlug`
- [ ] Removes the unused `kind: 'solid' | 'conic' | 'pulse'` discrimination on FrameDef.ring (no longer needed since rendering is image-based)

## Task 3: PublicProfileData type + lookup

**Files:**
- Modify: `lib/publicProfile.ts`

- [ ] Add `equipped_name_fx: string | null` to `PublicProfileData`
- [ ] Add `equipped_name_fx` to `DirectRow` SELECT (selects `p.equipped_name_fx`)
- [ ] Pass through to the returned data object

## Task 4: Frame renderer

**Files:**
- Modify: `components/customization/Frame.tsx` (full rewrite)

- [ ] Image-based: `<img>` overlay around content slot
- [ ] Renders bare avatar wrapper when slug is null/unknown
- [ ] Optional `haloColor` → outer `box-shadow`
- [ ] Optional `ringInset` → inset of inner content slot (default 4px)
- [ ] Preserves existing public API: `<Frame slug={slug} size={size} className={className}>{children}</Frame>` so all callers unchanged

## Task 5: Badge renderer

**Files:**
- Modify: `components/customization/Badge.tsx` (full rewrite)

- [ ] Image-based: `<img className="h-5 w-5">`
- [ ] Renders `null` when slug is null/unknown
- [ ] Title attribute carries `description` from registry

## Task 6: NameFx renderer (new)

**Files:**
- Create: `components/customization/NameFx.tsx`

- [ ] `<NameFx slug={slug} className={className}>{children}</NameFx>`
- [ ] Wrapper `<span style="position:relative;display:inline-block">`
- [ ] If `cssClass` set on registry entry → apply class to wrapper
- [ ] If `imageUrl` set → overlay absolute `<img>` with `mix-blend-mode: screen`
- [ ] Unknown/null slug → render children unchanged (no wrapper)

## Task 7: ThemeAmbient renderer (new)

**Files:**
- Create: `components/customization/ThemeAmbient.tsx`

- [ ] `<ThemeAmbient slug={slug} />` — no children
- [ ] Renders `null` when slug is null/unknown
- [ ] `assetType: 'image'` → `<img className="fixed inset-0 -z-10 h-full w-full object-cover pointer-events-none">`
- [ ] `assetType: 'video'` → `<video autoPlay loop muted playsInline>` with same positioning, `<source>` from `videoUrl`

## Task 8: SettingsProfile type extension

**Files:**
- Modify: `components/account/settings/shared.tsx`

- [ ] Add `equipped_name_fx: string | null` to `SettingsProfile` type

## Task 9: MeData type extension

**Files:**
- Modify: `app/account/page.tsx`

- [ ] Add `equipped_name_fx: string | null` to `MeData.profile` type

## Task 10: /api/account/me GET

**Files:**
- Modify: `app/api/account/me/route.ts`

- [ ] Add `equipped_name_fx` to `Profile` type
- [ ] Add `equipped_name_fx` to the `select` column list in the profile query

## Task 11: /api/account/equip

**Files:**
- Modify: `app/api/account/equip/route.ts`

- [ ] Extend column mapping: `kind === 'name_fx'` → `equipped_name_fx` column
- [ ] Existing mappings stay unchanged

## Task 12: /api/account/unequip

**Files:**
- Modify: `app/api/account/unequip/route.ts`

- [ ] Add `'name_fx'` to `VALID_KINDS` set
- [ ] Add column mapping: `body.kind === 'name_fx'` → `equipped_name_fx`

## Task 13: CustomizationSection — 4th row

**Files:**
- Modify: `components/account/settings/CustomizationSection.tsx`

- [ ] Add 4th row beneath frame / badge / theme: "name fx"
- [ ] Reads `profile.equipped_name_fx`, calls `getNameFx(slug)` for the displayed name
- [ ] Preview slot renders a small visual stub (e.g., the user's display_name through `<NameFx>`) — works once registry is populated tomorrow; renders just the bare name today

## Task 14: PublicProfileView wiring

**Files:**
- Modify: `components/PublicProfileView.tsx`

- [ ] Import `<ThemeAmbient>` and `<NameFx>`
- [ ] Render `<ThemeAmbient slug={data.equipped_theme} />` at the top of the returned JSX
- [ ] Wrap the `<h1>` display name with `<NameFx slug={data.equipped_name_fx}>{data.display_name}</NameFx>`
- [ ] Existing tier-coloured radial wash gradient stays unconditionally as a subtle backdrop accent (no longer reads from `theme.accent` since that field doesn't exist on the new `ThemeDef`)

## Task 15: Store page rewrite

**Files:**
- Modify: `app/account/store/page.tsx` (full rewrite per spec §11)

- [ ] Header: ← back · "store" h1 · "flat pricing · $4 → $10" eyebrow
- [ ] 4-tab bar with price chips: frames ($6), badges ($4), name fx ($8), themes ($10)
- [ ] Section head with tab name + item count
- [ ] Card grid (auto-fill 240px min)
- [ ] Each card: live preview area (renders cosmetic via registry), name, description, "not owned" / "owned" / "equipped" state, action button
- [ ] Empty-state card per category when registry map is empty (which is true for every category today)
- [ ] Existing API flow preserved (`/api/catalog` GET, `/api/account/equip`, `/api/account/unequip`, `/api/checkout/create-session`)
- [ ] Hover lift, frosted glass, smooth transitions

## Task 16: Typecheck

- [ ] `npx tsc --noEmit` — must be clean (excluding the pre-existing Stripe `Cannot find module` errors that clear on `npm install`)

## Task 17: Commit

- [ ] `git add` all changed/created files
- [ ] Commit message:
  ```
  Cosmetic overhaul scaffold — image-based architecture + Discord store

  Replaces the CSS/SVG-driven cosmetic system with a registry of
  image (or video) assets hosted in Supabase Storage. Products land
  tomorrow — today ships everything else: schema migration, types,
  API routes, renderers, settings UI, and the rebuilt store page.
  ```
- [ ] No Co-Authored-By trailer (per project preference)
