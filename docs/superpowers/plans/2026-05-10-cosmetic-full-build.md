# Cosmetic Catalog — Full Build Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Inline execution. Batch typecheck/commit at the end of each phase. No Co-Authored-By trailer.

**Goal:** Ship the entire 60-item cosmetic catalog (every shader, SVG, and CSS animation working at production quality), plus the holymog+ subscription system, achievement engine, ad slots, store UI extensions, upgrade page, and settings — end to end. Every design must actually render and animate. No half-built placeholders allowed past the verification gate.

**Supersedes:** `2026-05-10-cosmetic-catalog-and-subscription.md`. That plan covered scaffolding; this one builds the actual designs with exhaustive per-item detail. Specs in `2026-05-10-cosmetic-catalog-and-subscription-design.md` and `2026-05-10-cosmetic-catalog.md` remain authoritative.

**Scope size:** 60 React components (26 WebGL shaders + 34 CSS/SVG/HTML) + shared shader infrastructure + 9 smart-cosmetic data-thread sites + 21 backend tasks across schema/subscription/achievements/ads.

**Orchestration:** 5 agents total — **1 foundation agent (me)** + **4 parallel design agents**. Foundation agent does Phases 1–6 sequentially, then Phase 12 in parallel with the design agents, then Phases 11/13/14 after their work merges. Design agents are split by cosmetic kind: A (16 frames), B (15 badges), C (14 name fx), D (15 themes). Sequential total: ~55–65h. **Parallel total: ~36h wall-clock**, of which only ~24h is on the critical path (foundation + merge/verification); the 12h cosmetic-building window happens in parallel.

**Tech stack:** Next.js 16 App Router, React 19.2, TypeScript strict, Supabase Postgres + Storage, Stripe Subscriptions, AdSense, WebGL1 directly (no `@paper-design/shaders-react` dependency — keeps bundle lean and gives us full control of the fragment shaders). Animation primitives: `framer-motion` (already in deps), CSS `@keyframes`, SVG `stroke-dasharray`, WebGL fragment shaders authored as inline GLSL strings.

**Codebase note:** No test suite. Verification per phase = `npx tsc --noEmit` + manual `/dev/cosmetic-preview` browser smoke. Each cosmetic component gets a dedicated row on the preview page so we can eyeball all 60 simultaneously.

---

## Orchestration Model

### Roles

**Foundation agent (me, this conversation).** Sequential ownership of:
- Phase 1: schema migration
- Phase 2: subscription helper + Stripe webhook/checkout extensions
- Phase 3: server-side benefit gates + monthly claim endpoint
- Phase 4: shared shader infrastructure (the critical-path dependency every design agent inherits)
- Phase 5: smart cosmetic plumbing (broadens Frame/Badge/NameFx/ThemeAmbient renderers with `userStats` prop; threads through every render site)
- Phase 6: achievement engine
- Phase 12: store UI extensions, upgrade page, settings section (runs in parallel with design agents)
- Phase 11: catalog seed + registry merge (after design agents finish)
- Phase 13: verification (after registry merge)
- Phase 14: final commit

**Design agents A, B, C, D.** Parallel ownership, each scoped to one cosmetic kind:

| Agent | Kind | Components | Phase | Est. hours | Branch |
|---|---|---|---|---|---|
| A | Frames | 16 | Phase 7 | 12h | `cosmetics-frames` |
| B | Badges | 15 | Phase 8 | 7h | `cosmetics-badges` |
| C | Name FX | 14 | Phase 9 | 5h | `cosmetics-name-fx` |
| D | Themes | 15 | Phase 10 | 9h | `cosmetics-themes` |

### Branch + worktree setup (done by foundation agent before launching design agents)

```bash
# After foundation agent finishes phases 1-6 on main:
git checkout main
git pull

# Create 4 worktrees, each on its own branch off the post-foundation main:
git worktree add ../holymog-frames cosmetics-frames
git worktree add ../holymog-badges cosmetics-badges
git worktree add ../holymog-name-fx cosmetics-name-fx
git worktree add ../holymog-themes cosmetics-themes
```

Each worktree is a full repo checkout on its branch. Design agents work in their assigned worktree directory.

### File ownership map (no agent touches another agent's files)

| File / directory | Owner |
|---|---|
| `components/cosmetics/frames/*` | Agent A only |
| `components/cosmetics/badges/*` | Agent B only |
| `components/cosmetics/name-fx/*` | Agent C only |
| `components/cosmetics/themes/*` | Agent D only |
| `app/dev/cosmetic-preview/sections/FramesSection.tsx` | Agent A |
| `app/dev/cosmetic-preview/sections/BadgesSection.tsx` | Agent B |
| `app/dev/cosmetic-preview/sections/NameFxSection.tsx` | Agent C |
| `app/dev/cosmetic-preview/sections/ThemesSection.tsx` | Agent D |
| `app/dev/cosmetic-preview/page.tsx` | Foundation agent (just imports the 4 sections) |
| `lib/customization.ts` registry blocks | Each agent updates ONLY their kind's block (see split below) |
| Shared shader helpers (`components/cosmetics/glsl/*.ts`) | Foundation agent (Phase 4) — design agents read-only |
| Shared `ShaderCanvas.tsx` + `StaticFallback.tsx` | Foundation agent (Phase 4) — design agents read-only |
| Renderer files (`components/customization/Frame.tsx` etc.) | Foundation agent (Phase 5) — design agents read-only |
| All non-cosmetic files | Foundation agent |

### `lib/customization.ts` registry split

Foundation agent (Phase 5) pre-creates the file with the four registry maps as empty objects + clearly-marked comment fences:

```ts
// === FRAMES (agent A owns this block) ============================================
export const FRAMES: Record<string, FrameDef> = {
  // (agent A populates 16 entries here)
};
// === END FRAMES ===================================================================

// === BADGES (agent B owns this block) ============================================
export const BADGES: Record<string, BadgeDef> = {
  // (agent B populates 15 entries here)
};
// === END BADGES ===================================================================

// === NAME_FX (agent C owns this block) ===========================================
export const NAME_FX: Record<string, NameFxDef> = {
  // (agent C populates 14 entries here)
};
// === END NAME_FX ==================================================================

// === THEMES (agent D owns this block) =============================================
export const THEMES: Record<string, ThemeDef> = {
  // (agent D populates 15 entries here)
};
// === END THEMES ===================================================================

export const SMART_SLUGS: Set<string> = new Set([
  // foundation agent populates this with the 9 smart slugs once they're known
]);
```

Each agent's commit edits only their own fenced block. Merge conflicts on this file are impossible because the blocks are spatially separated.

### Per-agent brief docs

Before launching the 4 design agents, foundation agent writes 4 self-contained brief files at:
- `docs/superpowers/plans/agent-briefs/frames-agent-brief.md`
- `docs/superpowers/plans/agent-briefs/badges-agent-brief.md`
- `docs/superpowers/plans/agent-briefs/name-fx-agent-brief.md`
- `docs/superpowers/plans/agent-briefs/themes-agent-brief.md`

Each brief is self-contained: design specs for that kind, file ownership, the registry block they own, the preview-section file they own, branch name, smoke-test gate, stop-conditions, no instructions to read other plan docs. Each agent's session starts by reading just one brief.

### Communication protocol

- Agents do NOT cross-pollute. No agent reads another's files. No agent modifies foundation-owned files.
- Each agent finishes by committing all changes to its branch and printing a one-line status: `done · N components committed · M passes preview smoke · branch cosmetics-{kind} ready to merge`.
- Foundation agent merges branches sequentially after all 4 report done. Conflict resolution should be limited to the registry file (and only because of the fenced-block convention failing — which we don't expect).

### Stop conditions / escalation

Each design agent has explicit stop-conditions in its brief:
- If a shader doesn't compile or run after 3 implementation attempts → stop, document the issue in the brief's "blockers" section, move on to the next item.
- If a SMART item's userStats prop interface doesn't match expectations → stop, do not fabricate the API; flag for foundation agent.
- If `npx tsc --noEmit` fails after creating an item → fix immediately; don't queue up multiple compile errors.
- If `/dev/cosmetic-preview` shows console errors for an item → fix before moving on.

---

## File Structure

**Schema:**
- Create: `docs/migrations/2026-05-11-subscription-and-achievements.sql`
- Create: `docs/migrations/2026-05-11-cosmetic-catalog-seed.sql`

**Libraries:**
- Create: `lib/subscription.ts`, `lib/achievements.ts`, `lib/shader-budget.ts`
- Create: `hooks/useSubscription.ts`, `hooks/useAchievementToast.ts`, `hooks/useShaderLifecycle.ts`, `hooks/useDocumentVisibility.ts`
- Modify: `lib/customization.ts` — UserStats type, smart-slug set, fenced registry blocks for 4 kinds
- Modify: `lib/publicProfile.ts` — return `weakest_sub_score`
- Modify: `lib/scoreEngine.ts` — add `weakestSubScore(scores)` helper

**Shared cosmetic infrastructure (foundation only):**
- Create: `components/cosmetics/ShaderCanvas.tsx` (WebGL1 wrapper + lifecycle + fallback)
- Create: `components/cosmetics/StaticFallback.tsx` (reduced-motion fallback primitive)
- Create: `components/cosmetics/glsl/noise.ts` (Simplex noise GLSL as string export)
- Create: `components/cosmetics/glsl/palette.ts` (IQ palette GLSL as string export)
- Create: `components/cosmetics/glsl/sdf.ts` (circle/ring/segment SDFs as string export)

**Renderers (foundation only — modify to thread userStats):**
- Modify: `components/customization/Frame.tsx`, `Badge.tsx`, `NameFx.tsx`, `ThemeAmbient.tsx`

**60 cosmetic components (parallel agent ownership):**
- `components/cosmetics/frames/{slug}.tsx` × 16 — Agent A
- `components/cosmetics/badges/{slug}.tsx` × 15 — Agent B
- `components/cosmetics/name-fx/{slug}.tsx` × 14 — Agent C
- `components/cosmetics/themes/{slug}.tsx` × 15 — Agent D

**App-level new components (foundation only):**
- `components/AdSlot.tsx`, `components/SubscriberBadge.tsx`, `components/AchievementToast.tsx`
- `components/store/MonthlyClaimBanner.tsx`, `components/store/AchievementProgress.tsx`
- `components/account/settings/SubscriptionSection.tsx`, `components/account/UpgradeCard.tsx`

**Dev-only verification page:**
- Create: `app/dev/cosmetic-preview/page.tsx` (foundation) — imports 4 sections
- Create: `app/dev/cosmetic-preview/sections/FramesSection.tsx` (Agent A)
- Create: `app/dev/cosmetic-preview/sections/BadgesSection.tsx` (Agent B)
- Create: `app/dev/cosmetic-preview/sections/NameFxSection.tsx` (Agent C)
- Create: `app/dev/cosmetic-preview/sections/ThemesSection.tsx` (Agent D)

**Pages (foundation only):**
- Modify: `app/account/store/page.tsx` — sub-only badges, achievement progress, claim banner, upgrade CTA
- Create: `app/account/upgrade/page.tsx`

**API routes (foundation only):** [same enumeration as prior plan]

---

# PART I — Foundation phases (sequential, foundation agent only)

## Phase 1 — Schema + foundation (~2h)

**Owner:** Foundation agent.

- [ ] Write `docs/migrations/2026-05-11-subscription-and-achievements.sql` (subscription columns on profiles, catalog_items extensions, user_inventory source-check, achievement_progress table, indexes)
- [ ] Print manual gate instructions, wait for user confirmation
- [ ] Add `lib/scoreEngine.ts:weakestSubScore(scores: FinalScores): SubScoreKey` helper
- [ ] Extend `lib/publicProfile.ts:PublicProfileData` with `weakest_sub_score` field, compute server-side from best_scan
- [ ] Extend `Profile` SELECT + GET response in `app/api/account/me/route.ts` to include `subscription_status`, `subscription_tier`, `subscription_current_period_end`, `monthly_cosmetic_claimed_at`, `weakest_sub_score`
- [ ] Extend `SettingsProfile` (`components/account/settings/shared.tsx`) and `MeData.profile` (`app/account/page.tsx`) types

## Phase 2 — Subscription helper + hook + Stripe (~3h)

**Owner:** Foundation agent.

- [ ] `lib/subscription.ts` — `isSubscriber(userId)`, `applySubscriberDiscount(cents)`
- [ ] `hooks/useSubscription.ts` — returns `{ active, tier, periodEnd, loading }`, defaults to hidden during loading
- [ ] `app/api/webhooks/stripe/route.ts` — add `customer.subscription.{created,updated,deleted}` + `invoice.payment_failed` cases; branch existing `checkout.session.completed` for `mode === 'subscription'`
- [ ] `app/api/checkout/create-session/route.ts` — dispatch by body shape (cosmetic vs subscription); apply 20% discount for subscribers
- [ ] `app/api/account/billing-portal/route.ts` — Stripe Billing Portal session URL
- [ ] Append `STRIPE_PRICE_PLUS_MONTHLY=` and `STRIPE_PRICE_PLUS_ANNUAL=` to `.env.local` as placeholders

## Phase 3 — Server-side benefit gates + monthly cosmetic claim (~2h)

**Owner:** Foundation agent.

- [ ] `lib/scanLimit.ts` — subscriber bypass (unlimited scans)
- [ ] `app/api/account/banner/route.ts` — accept `video/mp4` + `image/gif` for subscribers, 8 MB cap
- [ ] `app/api/battle/create/route.ts` — `max_participants = subscriber ? 20 : 10`
- [ ] `app/api/account/equip/route.ts` — reject `subscriber_only` items with 403 for non-subscribers
- [ ] `app/api/cron/prune-old-data/route.ts` — skip rows where user is active subscriber
- [ ] `app/api/cron/expire-subscriptions/route.ts` — daily cron that flips `canceled`/`past_due` past `current_period_end` to `null` and unequips sub-only items
- [ ] `vercel.json` — register the new cron
- [ ] `app/api/account/redeem-monthly-cosmetic/route.ts` — POST claims a free frame or badge (30-day cooldown, idempotent, transactional)

## Phase 4 — Shared shader infrastructure (~3h)

**Owner:** Foundation agent. **This is the single most important phase. Everything in agents A–D depends on it. Build it carefully, then never touch it again.**

**`lib/shader-budget.ts`** — module-level counter. `acquireShaderSlot()` returns boolean (false if ≥8 active). `releaseShaderSlot()` decrements. `onShaderBudgetChange(fn)` subscription so newly-mounted shaders can wait for a slot to free up.

**`hooks/useDocumentVisibility.ts`** — wraps `document.visibilityState`, returns `boolean`.

**`hooks/useShaderLifecycle.ts`** — the core hook. Inputs: `{ canvasRef: RefObject<HTMLElement|null>, context: 'inline' | 'fullscreen' }`. Returns `{ disabled, paused, dpr }`.
- IntersectionObserver (`rootMargin: '100px'`) sets `inView` for inline context (fullscreen is always in-view)
- `matchMedia('(prefers-reduced-motion: reduce)')` → `reducedMotion`
- `useDocumentVisibility()` → `visible`
- Shader budget: try-acquire on `inView && !reducedMotion`, release on out-of-view or unmount
- `dpr = Math.min(window.devicePixelRatio || 1, 2)` — capped
- Returns: `disabled = reducedMotion || (context === 'inline' && !budgetOk)`, `paused = !visible || (context === 'inline' && !inView)`

**`components/cosmetics/ShaderCanvas.tsx`** — full WebGL1 wrapper. Props: `{ context, fallback, fragShader (GLSL string), uniforms?, className?, style? }`.
- Mounts a `<canvas>`, gets WebGL1 context, compiles a passthrough vertex shader + the consumer's fragment shader
- Standard vertex: full-screen triangle (3 verts, no need for quad indexing)
- Built-in uniforms always present: `uniform float u_time;`, `uniform vec2 u_resolution;`, `uniform float u_dpr;`. Consumer adds more via `uniforms` prop.
- RAF loop only runs when `!paused`. When `paused`, the canvas keeps its last frame visible.
- Handles `webglcontextlost`/`webglcontextrestored` events: pause + cleanup, then re-init.
- Disposes shader + buffers on unmount.
- When `disabled === true`, renders `fallback` ReactNode instead of the canvas.

**`components/cosmetics/StaticFallback.tsx`** — simple prop-driven gradient swatch. Used as the default fallback for every shader item.

**`components/cosmetics/glsl/noise.ts`** — exports a `string` constant with stable 2D Simplex noise (Stefan Gustavson port; ~30 lines GLSL). Imported by half the shader items.

**`components/cosmetics/glsl/palette.ts`** — `vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d)` — Iñigo Quílez palette function.

**`components/cosmetics/glsl/sdf.ts`** — circle, ring, segment SDFs.

These three GLSL helper files export `string` constants; design-agent shaders concatenate them via template literals.

## Phase 5 — Smart cosmetic plumbing (~4h)

**Owner:** Foundation agent.

[Same content as prior plan — UserStats type, 9 smart-slug set, broaden 4 renderers, thread userStats through every render site, extend API payloads with weakest_sub_score / equipped_name_fx / userStats fields.]

The foundation agent ALSO pre-creates `lib/customization.ts` with the fenced empty-block structure shown in the orchestration section above. Each design agent populates only their kind's block.

## Phase 6 — Achievement engine + toast + firing (~3h)

**Owner:** Foundation agent. [Same content as prior plan.]

---

# PART II — Parallel execution

After Phase 6 ships, foundation agent:
1. Commits everything on `main`. Pushes.
2. Writes the 4 per-kind agent briefs (`docs/superpowers/plans/agent-briefs/{kind}-agent-brief.md`).
3. Creates the 4 worktrees and pushes their initial branches.
4. **Begins Phase 12 in `main`** in parallel with the design agents (no file collisions since Phase 12 touches store/upgrade/settings, not cosmetic components).
5. Design agents start in their respective worktrees.

The 4 design agents and the foundation agent all run simultaneously for ~12 hours wall-clock.

## Phase 7 — 16 frames (~12h)

**Owner:** Design Agent A. **Branch:** `cosmetics-frames`. **Worktree:** `../holymog-frames`.

Agent A's scope (and only its scope):
- Create `components/cosmetics/frames/{slug}.tsx` for all 16 frame slugs
- Create `app/dev/cosmetic-preview/sections/FramesSection.tsx` that imports + previews each frame at sizes 48 / 96 / 256
- Populate the `FRAMES: Record<string, FrameDef>` block in `lib/customization.ts` (between the marked fences) with 16 entries

**Per-frame specs:** [same exhaustive design specs as the prior plan — lava-lamp, oil-slick, crt-scanline, mobius, cable, ferrofluid, torii, weather-front, scan-ring, elo-medal, streak-pyre (smart), canthal, crown-letters, scoreband (smart, size-gated), heartbreaker, stained-glass; each spec includes shader uniforms or SVG geometry, animation timing, reduced-motion fallback]

**Smoke gate (agent must pass before committing):**
- Each frame mounts in `FramesSection` without console errors
- Animated frames visibly animate (or fallback renders if reduced-motion enabled)
- Smart frames respond to mock userStats toggling
- `npx tsc --noEmit` clean

**Commit + report:** `git commit -m "frames: 16 cosmetic components"` on `cosmetics-frames` branch. Print `done · 16 frames committed · all pass preview smoke · branch cosmetics-frames ready to merge`.

## Phase 8 — 15 badges (~7h)

**Owner:** Design Agent B. **Branch:** `cosmetics-badges`. **Worktree:** `../holymog-badges`.

Agent B's scope:
- Create `components/cosmetics/badges/{slug}.tsx` × 15
- Create `app/dev/cosmetic-preview/sections/BadgesSection.tsx` (sizes 22 / 64)
- Populate the `BADGES` block in `lib/customization.ts`

**Per-badge specs:** [same exhaustive specs as prior plan — ripple, eclipse, match, tarot-back, compass, honeycomb, fractal, morse, scan-1, identity, duelist, king, tier-stamp (smart), holy-wordmark, gavel]

**Smoke gate:** all 15 mount, animate, smart items respond to userStats, tsc clean.

**Commit + report:** as above.

## Phase 9 — 14 name fx (~5h)

**Owner:** Design Agent C. **Branch:** `cosmetics-name-fx`. **Worktree:** `../holymog-name-fx`.

Agent C's scope:
- Create `components/cosmetics/name-fx/{slug}.tsx` × 14
- Add the corresponding CSS classes (`.name-fx-embossed-gold`, etc.) to `app/globals.css` near the bottom — single contiguous block, fenced with comment markers so foundation knows where it lives
- Create `app/dev/cosmetic-preview/sections/NameFxSection.tsx` (wrap "briangao" in each effect)
- Populate the `NAME_FX` block in `lib/customization.ts`

**Per-name-fx specs:** [same as prior plan — embossed-gold, carved-obsidian, smoke-trail, frosted-glass, ink-bleed, pixelsort, aurora, signed, tier-prefix (smart), callout (smart), streak-flame (smart), elo-king (smart), divine-judgment, score-overlay (smart)]

**Smoke gate:** all 14 wrap test text correctly, animations visible, smart items mutate based on userStats toggle, tsc clean, no CSS class collisions with existing globals.css.

**Commit + report:** as above.

## Phase 10 — 15 themes (~9h)

**Owner:** Design Agent D. **Branch:** `cosmetics-themes`. **Worktree:** `../holymog-themes`.

Agent D's scope:
- Create `components/cosmetics/themes/{slug}.tsx` × 15
- Create `app/dev/cosmetic-preview/sections/ThemesSection.tsx` (each theme in a 400×300 framed preview)
- Populate the `THEMES` block in `lib/customization.ts`

**Per-theme specs:** [same as prior plan — rain, dust, spotlight, corridor, aurora, tidewave, granite, match-found, tier-grid, win-stack (smart), embers, god-beam, divine-rays, throne, shockwave]

**Smoke gate:** all 15 render full-bleed in preview frames, animations run, smart theme (`win-stack`) responds to mock matchesWon, tsc clean.

**Commit + report:** as above.

## Phase 12 — Store UI, upgrade page, settings (~3h)

**Owner:** Foundation agent. **Runs in parallel with Phases 7–10 on `main`.** Doesn't touch cosmetic-component files or registry blocks, so no conflicts with design agents.

- [ ] `app/api/catalog/route.ts` — return `subscriber_only`, `unlock_method`, plus `achievement_progress` for the caller
- [ ] `app/account/store/page.tsx` — sub-only state branches, achievement progress bars, monthly claim banner
- [ ] `components/store/AchievementProgress.tsx`, `components/store/MonthlyClaimBanner.tsx`
- [ ] `app/account/upgrade/page.tsx` — pricing toggle, feature list, Stripe Checkout subscription flow
- [ ] `components/account/settings/SubscriptionSection.tsx` + mount in `AccountSettingsTab`
- [ ] `components/SubscriberBadge.tsx` — small inline glyph next to display name when `subscription_status === 'active'`. Wire into the same render sites as `<NameFx>` (profile, leaderboard rows, battle tile, follower list).
- [ ] `components/AdSlot.tsx` — single component, gated via `useSubscription()`, defaults hidden during loading
- [ ] Add AdSense script to `app/layout.tsx`
- [ ] Place `<AdSlot>` on `/account`, `/leaderboard`, `/help`, `/terms`, `/privacy`, `/share/[platform]`. Six placements total.
- [ ] Append `NEXT_PUBLIC_ADSENSE_CLIENT_ID=` to `.env.local`
- [ ] Commit Phase 12 work to `main` so the design-agent merges (next part) start from a clean state.

---

# PART III — Merge + final integration (sequential, foundation agent only)

After all 4 design agents report `ready to merge` AND foundation has committed Phase 12:

## Phase 11 — Merge + catalog seed + registry consolidation (~2h)

**Owner:** Foundation agent.

- [ ] `git checkout main`
- [ ] Merge each design branch in turn: `git merge cosmetics-frames`, then `cosmetics-badges`, `cosmetics-name-fx`, `cosmetics-themes`. Merges should be clean (the fenced-block convention prevents conflicts in `lib/customization.ts`; the per-section preview files don't overlap; CSS additions to `app/globals.css` from Agent C are in a fenced block).
- [ ] If any merge has unexpected conflicts: investigate, fix, do NOT force-merge.
- [ ] Verify `lib/customization.ts` has all 60 entries populated correctly: 16 frames + 15 badges + 14 name fx + 15 themes.
- [ ] Update `SMART_SLUGS` set with the 9 smart slugs: `frame.streak-pyre`, `frame.scoreband`, `badge.tier-stamp`, `name.tier-prefix`, `name.callout`, `name.streak-flame`, `name.elo-king`, `name.score-overlay`, `theme.win-stack`.
- [ ] Write `docs/migrations/2026-05-11-cosmetic-catalog-seed.sql` with 60 INSERT rows. Reference catalog spec §3 for exact slug/name/description/price/sort_order/subscriber_only/unlock_method per item. All `image_url = null`.
- [ ] Run in Supabase Studio. Verify counts per kind (15/16/14/15).
- [ ] `npx tsc --noEmit` clean.
- [ ] Verify `/account/store` shows all 4 tabs populated with all items, live-preview rendering each component.

## Phase 13 — Verification (~5h)

**Owner:** Foundation agent. **This is the single most important quality gate.** Every cosmetic must pass before commit.

### 13.1 `/dev/cosmetic-preview` page assembly

- [ ] Stitch `app/dev/cosmetic-preview/page.tsx` to import `<FramesSection>`, `<BadgesSection>`, `<NameFxSection>`, `<ThemesSection>` and render them in a long scroll list.
- [ ] Add the mock-userStats toggle at the top (low/mid/high stat levels — see prior plan for values).
- [ ] Add the reduced-motion toggle (overrides the media query for testing).
- [ ] Gate the page with `process.env.NODE_ENV !== 'production'`.

### 13.2 Per-item smoke (manual, all 60)

Open `/dev/cosmetic-preview` and walk down the page. For each of the 60 items:
- [ ] Mounts without console errors
- [ ] Animation runs (or fallback renders if reduced-motion)
- [ ] Smart items respond when toggling userStats levels
- [ ] At 22px (badges) and 48px (frames), items remain visually readable
- [ ] No layout shift after mount
- [ ] No memory leaks (scroll back and forth 10× — FPS stays stable)

Any item that fails → fix it immediately. Do NOT advance past Phase 13 with broken items.

### 13.3 Performance smoke

- [ ] Open `/leaderboard` in mobile Safari simulator with 50 entries. Verify FPS ≥30. Shader budget should cap concurrent instances at 8.
- [ ] Open `/@username` with a shader theme equipped. FPS ≥45.

### 13.4 Integration test

- [ ] Equip each cosmetic via the store. Verify persistence, profile render, leaderboard row render, battle tile render (frames + badges only), settings preview.
- [ ] Unequip via the store. Slot clears.
- [ ] Sub-only items: 403 for non-subscribers, success for subscribers.

### 13.5 Subscription smoke

- [ ] Test card 4242 4242 4242 4242 in Stripe test mode. Subscribe.
- [ ] Within 5s of webhook delivery: verify all 9 benefits activate.
- [ ] Cancel via Stripe Billing Portal. Benefits remain until period_end, then revoke.

### 13.6 Achievement smoke

- [ ] Complete first scan → `frame.scan-ring` + `badge.scan-1` granted, 2 toasts.
- [ ] Scan A-tier → `frame.canthal` + `badge.tier-stamp` + `name.tier-prefix` (3 grants).
- [ ] Win 25 battles → `frame.crown-letters` + `theme.win-stack`.
- [ ] Set bio → `badge.identity` + `name.signed`.

### 13.7 Type + lint

- [ ] `npx tsc --noEmit` clean.
- [ ] No `console.error` on any page during smoke flow.

### 13.8 Reduced-motion compliance

- [ ] Enable macOS Reduce Motion. Visit `/dev/cosmetic-preview`. Every shader item renders its static fallback. Every CSS animation pauses or replaces. Fix any item still animating.

## Phase 14 — Final commit (~30min)

**Owner:** Foundation agent.

- [ ] Single git add for all changed/created files.
- [ ] Commit message:

```
holymog+ subscription + 60-coded-cosmetic catalog + achievements + ads + verification

Ships the full cosmetic monetization stack with every design built in
code (26 WebGL shaders + 34 CSS/SVG), production-quality animations,
prefers-reduced-motion fallbacks, mobile-Safari-safe shader lifecycle,
9-item smart-cosmetic plumbing across all 4 renderers, full achievement
engine with multi-grant on A-tier scans and 25-win milestones,
subscription gating across all 9 benefits, ad slots on 6 utility
surfaces, store UI extensions, /account/upgrade, and subscription
settings.

Built in parallel across 5 agents (1 foundation + 4 design): foundation
shipped phases 1-6 + 12, design agents shipped phases 7-10 in their own
worktrees, foundation merged + ran integration verification.

Migrations: 2026-05-11-subscription-and-achievements.sql,
2026-05-11-cosmetic-catalog-seed.sql.

Stripe products required: holymog+ Monthly ($5/mo) + Annual ($50/yr).
Set STRIPE_PRICE_PLUS_MONTHLY, STRIPE_PRICE_PLUS_ANNUAL,
NEXT_PUBLIC_ADSENSE_CLIENT_ID in env.
```

No Co-Authored-By trailer.

- [ ] Clean up worktrees: `git worktree remove ../holymog-frames && git worktree remove ../holymog-badges && git worktree remove ../holymog-name-fx && git worktree remove ../holymog-themes`
- [ ] Delete the design branches once merged: `git branch -d cosmetics-frames cosmetics-badges cosmetics-name-fx cosmetics-themes`

---

# Self-Review Checklist

- [ ] Orchestration model is explicit: 5 agents, ownership documented, no shared-file conflicts ✓
- [ ] Foundation phases (1–6) all done sequentially by foundation agent before any design agent starts ✓
- [ ] Registry fencing in `lib/customization.ts` prevents merge conflicts ✓
- [ ] Phase 12 runs in parallel with design agents but on `main`, no file collisions ✓
- [ ] All shared infrastructure (ShaderCanvas, GLSL helpers, renderers with userStats prop) ships before design agents start ✓
- [ ] Each design agent has a self-contained brief; they don't read other plan docs ✓
- [ ] Verification runs sequentially after all merges, by foundation agent, never by a design agent on its own work ✓

---

# Time Estimates (parallel orchestration)

| Phase | Owner | Est. hours | Critical path? |
|---|---|---|---|
| 1. Schema + foundation | Foundation | 2h | ✓ |
| 2. Subscription + Stripe | Foundation | 3h | ✓ |
| 3. Server gates + claim | Foundation | 2h | ✓ |
| 4. Shader infrastructure | Foundation | 3h | ✓ |
| 5. Smart cosmetic plumbing | Foundation | 4h | ✓ |
| 6. Achievement engine | Foundation | 3h | ✓ |
| Pre-launch (briefs + worktrees) | Foundation | 0.5h | ✓ |
| --- launches design agents A/B/C/D --- |  |  |  |
| 7. 16 frames | Agent A | 12h | ✓ (longest of the 4) |
| 8. 15 badges | Agent B | 7h | (parallel, completes early) |
| 9. 14 name fx | Agent C | 5h | (parallel, completes early) |
| 10. 15 themes | Agent D | 9h | (parallel) |
| 12. Store UI + upgrade + settings | Foundation | 3h | (parallel with design agents) |
| 11. Merge + seed + registry consolidation | Foundation | 2h | ✓ |
| 13. Verification | Foundation | 5h | ✓ |
| 14. Final commit + cleanup | Foundation | 0.5h | ✓ |

**Critical path: Foundation 17.5h + max(Agent A 12h, Foundation Phase 12 3h) + Foundation 7.5h = 37h wall-clock.**

**Sequential equivalent: ~55–65h.**

**Speedup: ~1.5×.** Modest because the foundation work (which can't parallelize) dominates the critical path. Design agents don't reduce foundation time; they just compress the cosmetic-building window from 33h sequential to 12h wall-clock (with the longest kind being the bottleneck).

If user has bandwidth for more parallelism: split frames into 2 sub-agents (paid frames vs. achievement+sub-only frames), bringing the longest agent to ~6h. New critical path: 17.5 + 6 + 7.5 = 31h. Marginal additional speedup, more orchestration overhead.

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-10-cosmetic-full-build.md`.

**Next steps after user approval:**
1. Foundation agent (me) starts Phase 1 in the main worktree.
2. Foundation agent ships Phases 1–6 sequentially.
3. Foundation agent writes the 4 per-kind agent briefs.
4. Foundation agent creates worktrees + branches.
5. User launches design agents A/B/C/D in their respective worktrees (paste each brief into a fresh agent session).
6. Foundation agent runs Phase 12 in parallel on `main`.
7. Once all 4 design agents report done + Phase 12 is committed: foundation agent runs Phases 11/13/14.

**Standing preferences honored:**
- Inline execution, no further sub-agent spawning by foundation agent
- Batch typecheck per phase
- No per-task commits — phase-level batching
- No Co-Authored-By trailer
- No age caveats
