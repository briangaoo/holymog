# Cosmetic Catalog + holymog+ Subscription — Design Spec

**Date:** 2026-05-10
**Status:** Design approved. Pivoted from Higgsfield-generated assets to 100% coded cosmetics (WebGL shaders + CSS/SVG). Catalog ships alongside subscription gating, achievement engine, and ad slots.
**Authors:** brian gao, claude

---

## 1. Overview

Two interlocking systems:

1. **Cosmetic catalog** — 60 items across frames, badges, name fx, and themes. Three acquisition paths (paid one-time, earned through gameplay, holymog+ exclusive). Flat pricing per category. Every cosmetic is implemented in code — there are no PNG/MP4/APNG assets, just shaders and SVG/CSS components.
2. **holymog+ subscription** — $5/mo or $50/yr. Nine bundled benefits including unlimited scans, a visible subscriber badge, a monthly free cosmetic, 20% off all paid cosmetics, exclusive cosmetics, an ad-free experience, and several smaller features.

The two systems reinforce each other. Subscribers get exclusive cosmetics nobody else can buy + 20% off everything else + a clean ad-free site. The 30 paid items are the broad-appeal browsing layer. The 20 achievement items hook engaged users who might otherwise never spend. The 10 holymog+ items convert engaged users into subscribers.

**Strategic framing on the brand-relationship of each tier (locked in):**
- **Paid items are completely brand-unrelated.** Generic-but-unique flair (lava lamp, oil slick, ferrofluid, möbius, etc.) — you should NOT be able to pay your way to anything that signals "I play holymog."
- **Achievement items are FULLY holymog-native.** Tier letters, MediaPipe face-landmark dots, ELO, canthal-tilt eyes, mog culture. Earned, not bought. This is the social-status pyramid.
- **holymog+ exclusive items are brand-unrelated but elite/distinct.** Subscriber flair driven by visual singularity (golden god-rays, stained-glass cathedral, halo wordmark), not by mog culture.

**Strategic framing on ads:** display ads exist primarily to make the free experience slightly poorer than the subscriber experience, not as primary revenue. They are a friction mechanism — a constant ambient "upgrade to remove this" reminder on utility surfaces. They never run on rating/competition surfaces (where users are vulnerable) and never on the surfaces selling cosmetics or the subscription itself.

## 2. Pricing

### Cosmetics (one-time purchases)

| Category | Paid price | holymog+ price |
|---|---|---|
| Frames | $6.00 | $4.80 |
| Badges | $4.00 | $3.20 |
| Name FX | $8.00 | $6.40 |
| Themes | $10.00 | $8.00 |

Premium-aesthetic dollar amounts (no $3.99 nonsense). The 20% subscriber discount is exactly 20%, not a weird amount.

### Subscription

| Tier | Monthly | Annual | Savings |
|---|---|---|---|
| holymog+ | $5/mo | $50/yr | 17% off the monthly rate |

Net to us after Stripe fees (~3%) + chargebacks (~1%): ~$4.80/mo per subscriber.

## 3. The 60 cosmetics

Every item is a React component under `components/cosmetics/{kind}/{slug}.tsx`. The registry in `lib/customization.ts` maps each slug to its component import + display config. No image URLs anywhere unless an SVG icon happens to live in the bucket.

Build column:
- `shader` — WebGL fragment shader (GLSL), via `@paper-design/shaders-react` or hand-rolled
- `create` — CSS / SVG / HTML, no shader

### 3.1 Paid · 30 items

Generic-but-unique aesthetic concepts. Premium materials and procedural compositions. No brand reference required to want them.

#### Frames · 8 × $6

| slug | name | concept | build |
|---|---|---|---|
| `frame.lava-lamp` | lava lamp | molten blobs rising and merging in slow viscosity, sunset colors | shader |
| `frame.oil-slick` | oil slick | iridescent thin-film rainbow drifting across a wet-asphalt black ring | shader |
| `frame.crt-scanline` | crt scanline | green phosphor scanlines rolling around the ring with subtle screen curvature | shader |
| `frame.mobius` | möbius | a single möbius strip slowly rotating, monochrome | shader |
| `frame.cable` | cable | three colored wires braiding around the ring, server-rack feel | create |
| `frame.ferrofluid` | ferrofluid | black magnetic liquid spiking outward in living porcupine bristles | shader |
| `frame.torii` | torii | four torii gate silhouettes at cardinal points with a slow gold pulse | create |
| `frame.weather-front` | weather front | swirling pressure-system isobars with a lightning fork sparking once per loop | create |

#### Badges · 8 × $4

| slug | name | concept | build |
|---|---|---|---|
| `badge.ripple` | ripple | concentric water ripples expanding and fading on a slow loop | shader |
| `badge.eclipse` | eclipse | total solar eclipse with corona flares licking outward | shader |
| `badge.match` | match | a single match igniting, burning down, regenerating | shader |
| `badge.tarot-back` | tarot back | bold geometric tarot motif: sun and crescent moon stacked, gold on black | create |
| `badge.compass` | compass | minimalist cardinal-direction rose with the needle drifting like a real compass | create |
| `badge.honeycomb` | honeycomb | a single hex cell with a slow gold liquid level rising and falling inside | create |
| `badge.fractal` | fractal | algorithmic snowflake redrawing one branch at a time | create |
| `badge.morse` | morse | three pulsing dots cycling a slow rhythmic morse pattern | create |

#### Name FX · 7 × $8

| slug | name | concept | build |
|---|---|---|---|
| `name.embossed-gold` | embossed gold | letters appearing 3D-stamped in gold leaf with inner shadow | create |
| `name.carved-obsidian` | carved obsidian | letters chiseled into volcanic glass with a prismatic edge highlight | create |
| `name.smoke-trail` | smoke trail | wispy smoke drifting upward off each letter in real time | shader |
| `name.frosted-glass` | frosted glass | letters as etched frosted glass with subtle prismatic edge refraction | create |
| `name.ink-bleed` | ink bleed | sumi brush calligraphy with ink wicking outward into paper fibers | shader |
| `name.pixelsort` | pixelsort | refined horizontal pixel-sort distortion sliding through the letters | create |
| `name.aurora` | aurora | aurora gradient cycling through the letterforms, slow drift | create |

#### Themes · 7 × $10

| slug | name | concept | build |
|---|---|---|---|
| `theme.rain` | rain | procedural rain streaks falling across a near-black field with cool-toned bokeh | shader |
| `theme.dust` | dust | slow drifting particles in a warm gradient, faint volumetric light beam | shader |
| `theme.spotlight` | spotlight | shifting radial spotlights sweeping across a near-black backdrop | shader |
| `theme.corridor` | corridor | infinite perspective grid receding into a vanishing point, single accent color | create |
| `theme.aurora` | aurora | full-bleed aurora cycling through tier colors, slow horizontal drift | shader |
| `theme.tidewave` | tidewave | single oscillating sine-wave horizon with glow-point foam, near-black field | shader |
| `theme.granite` | granite | dark granite-grain noise with a slow caustic light pattern washing across | shader |

### 3.2 Achievement · 20 items

Obviously holymog-native: tier letters, ELO, mog culture, scan UX. Earned through engagement. Status symbols within the community.

#### Frames · 5

| slug | name | concept | build | unlock condition |
|---|---|---|---|---|
| `frame.scan-ring` | scan ring | mediapipe face-landmark dots and connecting lines forming the ring | create | complete 1 scan |
| `frame.elo-medal` | elo medal | concentric tier-color bands stacked like a target medallion | create | gain 100 ELO from base (1000) |
| `frame.streak-pyre` | streak pyre | **smart**: flame ring whose intensity scales with the user's current streak length | shader | maintain a 7-day streak |
| `frame.canthal` | canthal | ring of upward-tilted eye shapes pointing toward the avatar | create | scan A-tier or higher |
| `frame.crown-letters` | crown letters | tier-letter glyphs (S+, S, A, B...) arranged as a crown on the upper arc | create | win 25 battles |

#### Badges · 5

| slug | name | concept | build | unlock condition |
|---|---|---|---|---|
| `badge.scan-1` | first scan | scanner reticle with the corner brackets locking onto a center dot | create | complete 1 scan |
| `badge.identity` | identity | face-profile silhouette filled in with a single horizontal scan-line passing | create | set your bio |
| `badge.duelist` | duelist | two profile silhouettes facing each other in 1v1 stance | create | win 5 battles |
| `badge.king` | king | chess king piece with a faint pulsing aura | create | reach 1300 ELO |
| `badge.tier-stamp` | tier stamp | **smart**: current tier letter stamped into the badge with crisp brand colors | create | scan A-tier or higher |

#### Name FX · 5 (4 are smart cosmetics — read live user data)

| slug | name | concept | build | unlock condition |
|---|---|---|---|---|
| `name.signed` | signed | clean handwritten signature underline that draws itself once on render | create | set your bio |
| `name.tier-prefix` | tier prefix | **smart**: live tier letter precedes the name everywhere ("S+ briangao") | create | scan A-tier or higher |
| `name.callout` | callout | **smart**: weakest sub-score in brackets cycles per visit ("(jawline)", "(eyes)") | create | complete 10 scans |
| `name.streak-flame` | streak flame | **smart**: current streak digit appears next to the name in flame ("3🔥") | create | maintain a 5-game win streak |
| `name.elo-king` | elo king | **smart**: current ELO appears as small superscript next to the name | create | reach 1500 ELO |

#### Themes · 5

| slug | name | concept | build | unlock condition |
|---|---|---|---|---|
| `theme.match-found` | match found | two profile silhouettes anchored on opposite edges with a slow connecting pulse linking them across the center — matchmaking visualization | create | queue your 1st battle |
| `theme.tier-grid` | tier grid | tier-letter pattern (S+/A/B/C) tiling and slowly cycling tier colors | create | complete 50 scans |
| `theme.win-stack` | win stack | **smart**: the user's win count stacking visibly as a column of tier-color bars on one edge | create | win 25 battles |
| `theme.embers` | embers | particle field of glowing embers rising upward, pyre vibe | create | maintain a 14-day streak |
| `theme.god-beam` | god beam | volumetric divine light beam descending from above onto a near-black field | shader | scan an S-tier or higher |

### 3.3 holymog+ exclusive · 10 items

Only available to active subscribers. Religious/divine iconography mixed with subscriber-status flair (score overlays, halo wordmarks). These are the marquee status flexes.

#### Frames · 3

| slug | name | concept | build |
|---|---|---|---|
| `frame.scoreband` | scoreband | **smart**: ring rendered as the user's peak overall-score digits repeating. Renders the digit pattern at size ≥ 96px and falls back to a static gold ring outline on inline avatar contexts (battle tiles, leaderboard rows) for readability | create |
| `frame.heartbreaker` | heartbreaker | ring of broken hearts mending and re-breaking on a slow heartbeat pulse | create |
| `frame.stained-glass` | stained glass | cathedral stained-glass panels arranged radially in deep jewel tones, light shifting through them in slow temperature drift | shader |

#### Badges · 2

| slug | name | concept | build |
|---|---|---|---|
| `badge.holy-wordmark` | holy wordmark | the holymog wordmark inside a thin halo, slow gold rotation | create |
| `badge.gavel` | gavel | a gavel mid-strike with a radial shockwave pulsing outward on impact | shader |

#### Name FX · 2

| slug | name | concept | build |
|---|---|---|---|
| `name.divine-judgment` | divine judgment | letters burning with golden judgment flame, halo above each character | shader |
| `name.score-overlay` | score overlay | **smart**: peak overall-score floats above the name in tiny gold digits | create |

#### Themes · 3

| slug | name | concept | build |
|---|---|---|---|
| `theme.divine-rays` | divine rays | golden god-rays radiating from a centered halo across the full field | shader |
| `theme.throne` | throne | centered crown silhouette with a slow-rotating gold particle ring around it | create |
| `theme.shockwave` | shockwave | gold and obsidian radial shockwave pulsing outward on a slow heartbeat | shader |

### 3.4 Smart cosmetics — live-data items

8 of the 60 items render differently per user based on their live state. They require `userStats` to be threaded through render sites:

| Item | Required user data |
|---|---|
| `frame.streak-pyre` | `currentStreak` (flame intensity scales linearly) |
| `frame.scoreband` | `bestScanOverall` (rendered as repeating digit ring) |
| `badge.tier-stamp` | `bestScanOverall` (computes tier letter via `getTier()`) |
| `name.tier-prefix` | `bestScanOverall` (computes tier letter via `getTier()`) |
| `name.callout` | `weakestSubScore` (cycles between 4 sub-score keys) |
| `name.streak-flame` | `currentWinStreak` |
| `name.elo-king` | `elo` |
| `name.score-overlay` | `bestScanOverall` |
| `theme.win-stack` | `matchesWon` (rendered as column of stacked tier-color bars) |

`<Frame>`, `<Badge>`, `<NameFx>`, and `<ThemeAmbient>` all accept an optional `userStats` prop. Render sites (PublicProfileView, battle tiles, leaderboard rows, follower lists, settings preview) thread this prop. When `userStats` is absent (e.g. third-party rendering contexts), smart items render their default state (e.g. tier-prefix renders nothing, streak-flame renders just the name, scoreband renders the static fallback).

`userStats` shape:
```ts
type UserStats = {
  elo?: number | null;
  bestScanOverall?: number | null;
  currentStreak?: number | null;
  currentWinStreak?: number | null;
  matchesWon?: number | null;
  weakestSubScore?: 'jawline' | 'eyes' | 'skin' | 'cheekbones' | null;
};
```

`weakestSubScore` is computed at fetch time on the server (cheapest there since the scan record is in-hand) and shipped down with the profile/leaderboard payload.

### 3.5 Achievement → slug map

Some achievement thresholds grant multiple items (e.g. A-tier scan grants 3 items across 3 kinds). Authoritative mapping:

| Threshold | Slugs granted |
|---|---|
| Complete 1 scan | `frame.scan-ring`, `badge.scan-1` |
| Set bio | `badge.identity`, `name.signed` |
| Win 5 battles | `badge.duelist` |
| 5-game win streak | `name.streak-flame` |
| Reach 1300 ELO | `badge.king` |
| Reach 1500 ELO | `name.elo-king` |
| Gain 100 ELO from base | `frame.elo-medal` |
| Maintain 7-day streak | `frame.streak-pyre` |
| Maintain 14-day streak | `theme.embers` |
| Scan A-tier or higher | `frame.canthal`, `badge.tier-stamp`, `name.tier-prefix` |
| Scan S-tier or higher | `theme.god-beam` |
| Complete 10 scans | `name.callout` |
| Complete 50 scans | `theme.tier-grid` |
| Win 25 battles | `frame.crown-letters`, `theme.win-stack` |
| Queue 1st battle | `theme.match-found` |

## 4. holymog+ subscription

### 4.1 Pricing

- **$5 / month** (recurring monthly)
- **$50 / year** (recurring annually, saves 17%)

Both via Stripe Subscriptions (`mode: 'subscription'` on Checkout Session). Single tier — no basic/pro split. Resist tiering until product depth justifies it.

### 4.2 Every feature

#### 1. Unlimited scans (vs 10/day)

Currently free users get 10 scans per rolling 24-hour window. Subscribers bypass this limit entirely. Implementation: `lib/scanLimit.ts:checkScanLimit()` returns `{ allowed: true, ... }` for subscribers regardless of count. Anonymous users still hit the lifetime cookie + IP fence.

#### 2. holymog+ badge

A visible "holymog+" badge renders next to the subscriber's display name everywhere their name appears (public profile, leaderboard rows, battle tiles, follower lists, settings). This is separate from the equipped cosmetic badge slot — both render. The holymog+ badge is the canonical subscriber identifier; non-subscribers cannot fake it via cosmetics.

Implementation: extend the display-name rendering wrapper (or add a sibling component to `<NameFx>`) that conditionally shows the holymog+ glyph when `profile.subscription_status === 'active'`. The glyph itself is a small iridescent or gold badge, distinguishable from any cosmetic.

#### 3. Monthly cosmetic credit

Each subscriber can claim one free frame or badge of their choice each month. Cooldown is per-user anniversary (30 days from last claim). Lets subscribers grow their inventory passively over time.

Implementation: `monthly_cosmetic_claimed_at timestamptz` column on profiles; `/api/account/redeem-monthly-cosmetic` endpoint accepts a slug, validates active subscription + slot eligibility (frame or badge only) + cooldown elapsed, inserts into `user_inventory` with `source = 'subscription_credit'`. Front-end shows a banner in the store: "claim your free monthly frame or badge."

#### 4. 20% discount on all paid cosmetics

Subscribers see all paid items at 20% off. Implementation: at Stripe Checkout Session creation in `app/api/checkout/create-session/route.ts`, when the user is a subscriber, multiply each line item's `unit_amount` by 0.80 before submitting. The store UI also displays the discounted price + a strike-through original price for subscribers.

#### 5. 10 subscriber-exclusive cosmetics

The 10 items in §3.3 are not purchasable individually. Equipping any of them requires `profile.subscription_status === 'active'`. If a subscriber lapses, they keep the items in `user_inventory` but the `equip` endpoint refuses to equip them (and unequips silently if currently equipped, falling back to nothing). On re-subscription, equipped state is restored from the last known equipped slug.

Implementation: `subscriber_only boolean default false` column on `catalog_items`. `/api/account/equip` rejects with 403 `subscriber_only_item` when a non-subscriber tries. The store shows these items with "subscribe to unlock" instead of a price button.

#### 6. Animated profile banner

Regular users can upload a static image banner (PNG/JPG/WEBP, 4MB cap, current behavior). Subscribers can additionally upload an animated GIF or MP4 (8MB cap, 1080×360 or similar widescreen). Implementation: extend `app/api/account/banner/route.ts` to accept `video/mp4` and `image/gif` MIME types when the user is a subscriber. Profile rendering switches between `<img>` and `<video autoPlay loop muted playsInline>` based on the file type stored.

#### 7. Bigger private parties (10 → 20 participants)

Free users can create private parties up to 10 participants. Subscribers can create up to 20. Implementation: `app/api/battle/create/route.ts` checks subscription status and sets `max_participants = subscriber ? 20 : 10` on the new battle row. UI banner in the lobby reflects the cap.

#### 8. Extended scan history retention (90 days → forever)

The existing data-retention cron deletes old `scan_history` rows after 90 days for free users. Subscribers' scans are never deleted — historical breakdowns remain available indefinitely. Implementation: extend the prune cron in `app/api/cron/prune-old-data/route.ts` to skip rows where `user_id IN (SELECT user_id FROM profiles WHERE subscription_status = 'active')`.

#### 9. Ad-free experience across the site

Free users see one display ad per utility page; subscribers see none. Ads exist purely to make the free experience slightly worse so the subscription value is concrete and felt continuously, not as a primary revenue line.

**Where ads render (free users only):**

| Surface | Slot type | Rationale |
|---|---|---|
| `/account` (settings, stats, history tabs) | sidebar | utility/meta page; users managing themselves, not being rated |
| `/leaderboard` | sidebar | browsing surface, low emotional stake |
| `/help` | sidebar | FAQ + contact form, pure utility |
| `/terms`, `/privacy` | inline | legal pages, low-friction surface |
| `/share/[platform]` interstitial | inline above the fold | already a 2-second placeholder page; ad slot fits naturally |

**Where ads NEVER render (firm rule, never relax):**

| Surface | Why |
|---|---|
| `/` (home hub) | first-impression page; premium feel non-negotiable |
| `/scan` | post-rating vulnerability moment; serving veneer/dental/cosmetic-procedure ads here is the predatory pattern we're avoiding |
| `/mog`, `/mog/battle` | real-time gameplay; ads break the competitive fugue |
| `/@username` (public profile) | someone else's flex page; ads cheapen the cosmetics they paid for |
| `/account/store` | ads here tank cosmetic conversion; this is the actual revenue page |
| `/account/upgrade` | can't have ads on the page selling ad removal |

**Format constraints:**
- 160×600 or 300×600 sidebar units; 728×90 inline for full-width contexts
- Widescreen only — hidden below 1024px viewport (mobile browsing stays clean)
- Single slot per page, never multiple
- AdSense CSS customization to match the dark brand palette
- AdSense Auto Ads disabled — manual placement only so we keep firm control over which surfaces render

**Implementation:**
- Single `<AdSlot slotId="...">` React component
- Returns `null` when `useSubscription().active === true` OR before the subscription check has resolved — defaults to hidden so subscribers never flash an ad while their state loads
- AdSense `<ins data-ad-slot>` tag inlined when free user
- Component placed in 5 surfaces above; no Auto Ads wrapper anywhere
- Estimated: ~40 lines for the component + ~5 placements = 2 hours total

**Subscriber UX guardrail:** if a paying subscriber sees an ad even once (cache bug, race condition, hook unloaded), the subscription value proposition feels broken. Default `<AdSlot>` to hidden during the loading window; better to flash empty space than flash an ad to a paying user. Test specifically.

### 4.3 Server-side gates

A single helper in `lib/subscription.ts`:

```ts
export async function isSubscriber(userId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query<{ status: string | null }>(
    `select subscription_status from profiles where user_id = $1 limit 1`,
    [userId],
  );
  const status = result.rows[0]?.status;
  return status === 'active' || status === 'trialing';
}
```

Used by:
- `lib/scanLimit.ts` (unlimited scans)
- `app/api/account/banner/route.ts` (animated banner allowed)
- `app/api/battle/create/route.ts` (20-person cap)
- `app/api/account/equip/route.ts` (sub-only item gate)
- `app/api/checkout/create-session/route.ts` (20% discount)
- `app/api/cron/prune-old-data/route.ts` (skip subscribers)
- `app/api/account/redeem-monthly-cosmetic/route.ts` (claim eligibility)

Plus a client-side `useSubscription()` hook that returns `{ active, tier, periodEnd }` for UI gating (visual only — server enforces actually). The ad-free benefit (§4.2 #9) is purely a client-side check via this hook — `<AdSlot>` returns `null` when `active === true`. There's no server-side gate for ads since the worst-case "subscriber sees an ad anyway" is just degraded UX, not a security issue.

## 5. How items are obtained

### Paid items
1. User browses store at `/account/store`
2. Clicks paid item card → `/api/checkout/create-session` POST with `{ items: [slug] }`
3. Server creates Stripe Checkout Session in `mode: 'payment'` with the line item (discounted 20% if subscriber)
4. User redirects to Stripe-hosted checkout, pays
5. Stripe webhook (`checkout.session.completed`) inserts row into `user_inventory` with `source = 'purchase'` and `stripe_payment_intent`
6. User redirected to `/account/store/success` → click "equip" → item live everywhere

### Achievement items
1. User performs the unlock action (scan, win battle, set bio, reach ELO threshold, etc.)
2. Server-side hook in the relevant endpoint (e.g. `/api/score`, `/api/battle/finish`, `/api/account/me` PATCH for bio) checks if any achievement thresholds were just crossed
3. If yes, INSERT into `user_inventory` with `source = 'achievement'` (idempotent via unique key). Use the multi-grant map in §3.5 — some thresholds grant multiple slugs.
4. Real-time toast notification to the user: "you unlocked [item name]" (one toast per item granted)
5. Item appears in store as "owned" + auto-claimed; user can equip from store or settings

### holymog+ exclusive items
1. User must have `subscription_status = 'active'`
2. Items appear in store with "subscribe to unlock" CTA for non-subscribers, or normal "equip" button for subscribers (no purchase needed — included with the sub)
3. `/api/account/equip` rejects non-subscribers with 403 `subscriber_only_item`
4. On subscription cancellation, items remain in inventory but are silently unequipped at the next sync

### Subscription
1. User clicks "upgrade to holymog+" from `/account/store`, settings, or a direct `/account/upgrade` page
2. Choose monthly ($5/mo) or annual ($50/yr) toggle
3. `/api/checkout/create-session` POST with `{ subscription: 'monthly' | 'annual' }` — server creates Checkout Session in `mode: 'subscription'`
4. User redirects to Stripe, pays, redirects to `/account/store/success`
5. Webhook (`checkout.session.completed` with `mode === 'subscription'`) sets `profile.subscription_status = 'active'`, `subscription_tier = 'plus'`, `subscription_started_at = now()`, `subscription_current_period_end = ...`, `stripe_subscription_id = ...`
6. All nine benefits activate immediately
7. Subsequent webhooks (`customer.subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`) keep the profile state in sync

### Cancellation
1. Subscriber clicks "manage subscription" in settings
2. Server creates Stripe Billing Portal session (`stripe.billingPortal.sessions.create()`) and returns the URL
3. User cancels via the Stripe-hosted portal
4. Webhook (`customer.subscription.deleted`) sets `subscription_status = 'canceled'`
5. Benefits remain active until `subscription_current_period_end` (Stripe handles the until-period-end logic; we just check the timestamp)
6. After period end, profile flips to `subscription_status = null` (or `'expired'`); all benefits revoke; equipped sub-only items unequip silently

## 6. Schema changes

New columns on `profiles`:

```sql
alter table profiles
  add column if not exists subscription_status text,        -- 'active' | 'trialing' | 'past_due' | 'canceled' | null
  add column if not exists subscription_tier text,          -- 'plus' (single tier for now)
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists stripe_subscription_id text,
  add column if not exists monthly_cosmetic_claimed_at timestamptz;
```

New column on `catalog_items`:

```sql
alter table catalog_items
  add column if not exists subscriber_only boolean default false,
  add column if not exists unlock_method text default 'purchase'
    check (unlock_method in ('purchase', 'achievement', 'subscriber', 'admin_grant'));
```

New columns on `user_inventory`:

```sql
alter table user_inventory
  add column if not exists subscription_credit_redeemed_at timestamptz;
-- Tracks when the monthly_cosmetic was claimed so we can audit
```

New table `achievement_progress` (optional but useful for "X / N progress" UI):

```sql
create table if not exists achievement_progress (
  user_id uuid not null references users(id) on delete cascade,
  achievement_key text not null,             -- e.g. 'win_5_battles', 'reach_1300_elo'
  progress integer not null default 0,
  achieved_at timestamptz,
  primary key (user_id, achievement_key)
);
```

For achievements that are pure threshold checks (1 scan, 1 battle, 1 follow), we can compute on the fly without persisting progress. For accumulating ones (win 25 battles, scan 50 times), persisting helps avoid recomputation and supports progress UI.

## 7. Open decisions

1. **Achievement claim flow** — auto-grant on threshold cross + toast notification, OR manual claim from a notification list?
   - **Recommend: auto-grant + toast.** Friction-free; toast creates the dopamine moment. Notification list adds UI surface for marginal gain.

2. **Sub-only item visibility for non-subscribers** — show in store with "subscribe to unlock" CTA, OR hide until subscribed?
   - **Recommend: show with CTA.** Sub-only items are the main shop window for the subscription itself. Hiding them removes that conversion mechanism.

3. **Monthly cosmetic anniversary vs first-of-month reset** — pick one for the monthly credit cooldown.
   - **Recommend: anniversary.** Month-aligned timing creates batched-claim spikes; per-user anniversary spreads load and feels personal.

4. **Smart cosmetic plumbing** — extend `<NameFx>`, `<Frame>`, `<Badge>`, and `<ThemeAmbient>` to accept `userStats` prop, or drop the 8 smart items?
   - **Recommend: extend.** ~4 hours work (broader than original 3-item plan since the pivoted catalog has 8 smart items spanning all 4 kinds). The data is mostly already in `PublicProfileData`. Without this extension, 8 catalog items can't ship; they're the items that make holymog feel alive in a way no Discord clone could.

5. **Quarterly rotation of holymog+ exclusive items** — keep 10 fixed forever, or rotate 3 quarterly to refresh the catalog?
   - **Recommend: keep 10 fixed for the first 6 months.** Simpler operationally. Revisit at 6 months when there's data on which items convert subscribers best; rotate the lowest performers.

## 8. Dependencies + sequencing

Order of implementation:

1. **Schema migration** (single SQL file: subscription columns, catalog_items extensions, user_inventory column, achievement_progress table)
2. **Subscription helper** (`lib/subscription.ts:isSubscriber()` + the `useSubscription()` client hook)
3. **Stripe webhook extensions** (handle `customer.subscription.*` events alongside existing `checkout.session.completed` and `charge.refunded`)
4. **Server-side gates** (apply `isSubscriber` to all 7 surfaces listed in §4.3)
5. **Smart cosmetic plumbing** (extend `<NameFx>`, `<Frame>`, `<Badge>`, `<ThemeAmbient>` to accept `userStats`; thread it through all render sites; add `weakestSubScore` to PublicProfileData and leaderboard payloads)
6. **Achievement engine** (threshold checks in `/api/score`, `/api/battle/finish`, `/api/account/me` PATCH, `/api/battle/queue`; auto-grant logic using the multi-grant map in §3.5; toast notifications)
7. **Shared shader infrastructure** (`useShaderLifecycle` hook covering intersection-observer gating, `prefers-reduced-motion` fallback, tab-visibility pause, DPR cap, concurrent-instance cap; `<ShaderCanvas>` wrapper component consumed by every shader item)
8. **60 cosmetic components** (built per kind in batches: frames → badges → name fx → themes; each item is one React component under `components/cosmetics/{kind}/{slug}.tsx`)
9. **Catalog seed migration** — INSERT 60 rows with all metadata, prices, unlock methods, `subscriber_only` flags. No `image_url` for coded items.
10. **Registry population** — add 60 entries to `lib/customization.ts` mapping each slug to its component import + display config
11. **Store UI extensions** — sub-only badge on cards, smart-cosmetic preview rendering, monthly-cosmetic claim banner, holymog+ upgrade CTA
12. **Settings integration** — subscription status row, manage subscription button (Stripe Billing Portal), monthly cosmetic claim UI
13. **AdSense integration** — apply for AdSense account on `hello@holymog.com` using `/account` as the application URL; create the `<AdSlot>` component with subscription gating; place on the 5 designated surfaces; verify ad serves to non-subscribers and renders nothing for subscribers
14. **Smoke test** — equip every item, redeem monthly cosmetic, subscribe → verify all 9 benefits active (including ad-free across the 5 placement surfaces), cancel → verify benefits roll off at period end

## 9. Acceptance criteria

The system is considered complete when:

1. All 60 cosmetics render correctly on profile, settings preview, battle tiles (frames + badges only), leaderboard rows
2. Smart cosmetics (8 items across all 4 kinds — `frame.streak-pyre`, `frame.scoreband`, `badge.tier-stamp`, `name.tier-prefix`, `name.callout`, `name.streak-flame`, `name.elo-king`, `name.score-overlay`, `theme.win-stack`) display correct live data per user across all surfaces
3. `frame.scoreband` renders the digit pattern only at size ≥ 96px and falls back to a static gold ring outline below that
4. Subscribing in test mode triggers all 9 benefits within 5 seconds of webhook delivery (including ad slots disappearing on the 5 placement surfaces)
5. Cancelling in test mode keeps benefits active until `current_period_end`, then revokes them cleanly (ads return on the 5 surfaces after expiry)
6. Achievement unlocks fire toast notifications and grant inventory rows on the correct threshold cross; multi-grant thresholds (A-tier scan, win 25 battles, complete 1 scan, set bio) grant all mapped slugs
7. Sub-only items reject equip from non-subscribers with a clean error
8. Monthly cosmetic claim works once per 30-day window per user
9. 20% discount applies correctly at Stripe Checkout for subscribers
10. Stripe webhook idempotency handles retries (no double-grants, no double-charges)
11. Ad slots render on `/account`, `/leaderboard`, `/help`, `/terms`, `/privacy`, `/share/[platform]` for free users on widescreen viewports; render nothing for subscribers; render nothing on mobile (below 1024px); never render on `/`, `/scan`, `/mog`, `/mog/battle`, `/@username`, `/account/store`, `/account/upgrade`
12. `<AdSlot>` defaults to hidden during subscription-state loading window (no flash-of-ad to subscribers)
13. Mobile Safari renders a leaderboard with 50 entries (mix of shader + create frames) at ≥ 30fps without GL context-loss
14. `prefers-reduced-motion` users see static fallbacks for every shader item across the catalog
15. `npx tsc --noEmit` clean
16. No regressions on existing surfaces (battles, leaderboard, scan flow)

## 10. Performance constraints (mobile-aware)

The pivot to coded shaders means we control performance directly — no asset size to worry about — but inline shader frames mount on lists with many users at once (leaderboard rows, follower lists, battle tiles). Naive mounting would crash mobile Safari. Required behaviors, all implemented once in shared infrastructure:

### 10.1 `useShaderLifecycle` hook

A hook every shader component uses. Responsibilities:

- **Intersection-observer gating** — initialize the GL context only when the canvas is in-viewport; pause animation + release context when out of viewport for > 1 second; re-initialize on re-entry. Frames in scrollable lists never run when offscreen.
- **`prefers-reduced-motion` fallback** — if `(prefers-reduced-motion: reduce)` matches, the hook returns `disabled: true` and the component renders its static SVG/gradient fallback instead of mounting the canvas.
- **Tab-visibility pause** — `document.visibilityState === 'hidden'` pauses the animation; resumes on `visible`.
- **DPR cap** — `min(window.devicePixelRatio, 2.0)`, clamped even on iPhone Pro screens (3.0 native) to halve fragment cost.
- **FPS cap** — animation loop runs at 30fps cap when in a list-row context (passed as `context: 'inline'`), 60fps for theme + profile-page contexts (`context: 'fullscreen'`).

```ts
export function useShaderLifecycle(opts: {
  canvasRef: RefObject<HTMLCanvasElement>;
  context: 'inline' | 'fullscreen';
}): { disabled: boolean; paused: boolean; dpr: number };
```

### 10.2 `<ShaderCanvas>` wrapper

A wrapper around the canvas that consumes `useShaderLifecycle` and renders the static fallback when disabled. Every shader item composes it:

```tsx
<ShaderCanvas context="inline" fallback={<StaticGradient color="..."/>}>
  {({ gl, paused, dpr }) => /* shader-specific GLSL render code */}
</ShaderCanvas>
```

### 10.3 Concurrent-instance cap

The leaderboard and follower list pages cap mounted shader frames at 8 concurrent instances. Items beyond the cap render the reduced-motion fallback. List virtualization (already in place) ensures only on-screen rows mount, so this cap rarely trips in practice — it's a safety net for users with a 1080p phone that somehow fits 12 rows.

A module-level counter (`lib/shader-budget.ts`) tracks live instances. Shader components increment on mount + decrement on unmount; `useShaderLifecycle` returns `disabled: true` when the counter exceeds 8 at mount time.

### 10.4 Theme-context special case

Themes mount one full-bleed shader behind a profile page. No concurrent-instance issue. But they run at full 60fps and full DPR. The `<ThemeAmbient>` renderer uses `context: 'fullscreen'` and skips the budget counter (capped at 1 by definition — only one theme is equipped at a time).

### 10.5 Mobile-Safari WebGL specifics

- All shader components use WebGL1 (not WebGL2) — broader compatibility on older iOS.
- No floating-point textures (iOS Safari doesn't support `OES_texture_float_linear` reliably).
- Procedural-only shaders — no texture uploads beyond a 1×1 gradient lookup if needed.
- Context-loss recovery — `webglcontextlost` event handler re-mounts on `webglcontextrestored`.

### 10.6 Bundle-size budget

Shader source strings inline in component files compress well. Each shader runs ~50–150 lines of GLSL. With 32 shaders, raw GLSL adds ~150KB to the bundle (~30KB gzipped). Acceptable. If it exceeds 100KB gzipped, split the cosmetics route into a separate Next.js chunk via dynamic import on `/account/store`.
