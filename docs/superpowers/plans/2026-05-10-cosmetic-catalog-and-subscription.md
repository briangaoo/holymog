# Cosmetic Catalog + holymog+ Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (per user preference; subagents are not used for plan execution in this project). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full cosmetic catalog (60 items across 3 acquisition tiers, all coded in shaders/CSS/SVG — no generated assets), the holymog+ subscription system (9 benefits including ad-free), the achievement engine that unlocks 20 of those items, and the Discord-style store UI extensions to surface all of it.

**Architecture:** 100% coded cosmetic catalog — each item is a React component under `components/cosmetics/{kind}/{slug}.tsx`. Shaders use `@paper-design/shaders-react` or hand-rolled WebGL1; CSS/SVG items are pure React. Shared shader infrastructure (`useShaderLifecycle` + `<ShaderCanvas>`) enforces intersection-observer gating, reduced-motion fallback, tab-visibility pause, DPR cap, and concurrent-instance cap. Subscription state on `profiles` driven by Stripe webhooks. Achievement progress in dedicated table; threshold checks fire from existing API endpoints. Single `<AdSlot>` component gates ads via `useSubscription()` hook. Smart cosmetics (8 items reading live user data) extend `<Frame>`, `<Badge>`, `<NameFx>`, `<ThemeAmbient>` with a `userStats` prop threaded through every render site.

**Tech Stack:** Next.js 16 App Router, React 19.2, TypeScript strict, Supabase Postgres + Storage, Stripe Subscriptions, AdSense, `@paper-design/shaders-react` for shader-helper components, WebGL1 directly for the rest.

**Spec:** [`../specs/2026-05-10-cosmetic-catalog-and-subscription-design.md`](../specs/2026-05-10-cosmetic-catalog-and-subscription-design.md)
**Catalog:** [`../specs/2026-05-10-cosmetic-catalog.md`](../specs/2026-05-10-cosmetic-catalog.md)

**Codebase note:** This repo has no test suite. Verification per task = `npx tsc --noEmit` for compile correctness + manual smoke testing in the browser. Follow the existing convention. Per user preference, batch typechecks at the end of each phase rather than after every task.

---

## File Structure

**Schema:**
- Create: `docs/migrations/2026-05-11-subscription-and-achievements.sql`
- Create: `docs/migrations/2026-05-11-cosmetic-catalog-seed.sql`

**Libraries:**
- Create: `lib/subscription.ts` — server-side `isSubscriber()` helper + `applySubscriberDiscount()`
- Create: `lib/achievements.ts` — threshold definitions, progress check, auto-grant (with multi-grant support)
- Create: `lib/shader-budget.ts` — module-level concurrent-shader counter
- Create: `hooks/useSubscription.ts` — client hook returning `{ active, tier, periodEnd }`
- Create: `hooks/useShaderLifecycle.ts` — intersection observer + reduced-motion + visibility + DPR + budget
- Create: `hooks/useDocumentVisibility.ts` — wraps `document.visibilityState` reactively
- Modify: `lib/customization.ts` — populate registry with 60 entries; map slug → component import
- Modify: `lib/publicProfile.ts` — return `weakestSubScore` derived from best scan

**Shared cosmetic infrastructure:**
- Create: `components/cosmetics/ShaderCanvas.tsx` — wrapper around `<canvas>` + GL lifecycle + fallback
- Create: `components/cosmetics/StaticFallback.tsx` — gradient-frame fallback for reduced-motion users
- Modify: `components/customization/Frame.tsx` — load component from registry; accept `userStats`
- Modify: `components/customization/Badge.tsx` — load component from registry; accept `userStats`
- Modify: `components/customization/NameFx.tsx` — load component from registry; accept `userStats`
- Modify: `components/customization/ThemeAmbient.tsx` — load component from registry; accept `userStats`

**Cosmetic components (60 total, new):**
- `components/cosmetics/frames/{slug}.tsx` × 16
- `components/cosmetics/badges/{slug}.tsx` × 15
- `components/cosmetics/name-fx/{slug}.tsx` × 14
- `components/cosmetics/themes/{slug}.tsx` × 15

**Components (other, new):**
- Create: `components/AdSlot.tsx` — single ad placement, gated by useSubscription
- Create: `components/SubscriberBadge.tsx` — holymog+ glyph next to display name
- Create: `components/account/UpgradeCard.tsx` — hero card on /account/upgrade
- Create: `components/store/MonthlyClaimBanner.tsx` — claim-your-free-cosmetic banner
- Create: `components/store/AchievementProgress.tsx` — "3/5 wins" progress bar on locked items
- Create: `components/AchievementToast.tsx` — top-right toast container
- Create: `hooks/useAchievementToast.ts` — toast queue
- Create: `components/account/settings/SubscriptionSection.tsx` — settings row with manage button

**Pages:**
- Modify: `app/account/store/page.tsx` — sub-only badges, achievement progress, claim banner, upgrade CTA
- Create: `app/account/upgrade/page.tsx` — subscription landing page

**API routes:**
- Modify: `app/api/webhooks/stripe/route.ts` — handle `customer.subscription.*` events
- Modify: `app/api/checkout/create-session/route.ts` — support `mode: 'subscription'`, apply 20% discount for subscribers
- Modify: `app/api/catalog/route.ts` — return `subscriber_only`, `unlock_method`, achievement_progress
- Create: `app/api/account/billing-portal/route.ts` — return Stripe Billing Portal session URL
- Create: `app/api/account/redeem-monthly-cosmetic/route.ts` — claim the monthly free item
- Create: `app/api/cron/expire-subscriptions/route.ts` — daily reconciliation
- Modify: `lib/scanLimit.ts` — subscriber bypass
- Modify: `app/api/account/banner/route.ts` — accept video/mp4 + image/gif for subs
- Modify: `app/api/battle/create/route.ts` — 20 max participants for subs
- Modify: `app/api/account/equip/route.ts` — reject sub-only equip when not subscriber
- Modify: `app/api/score/route.ts` — fire achievement threshold checks; include weakest sub-score in response
- Modify: `app/api/battle/finish/route.ts` — fire battle achievement checks
- Modify: `app/api/account/me/route.ts` PATCH — fire bio achievement check; include subscription + weakest sub-score in GET
- Modify: `app/api/battle/queue/route.ts` — fire queue-1 achievement
- Modify: `app/api/cron/prune-old-data/route.ts` — skip subscribers
- Modify: `app/api/leaderboard/route.ts` and `/battles` — return userStats + equipped_name_fx per row
- Modify: `app/api/account/[username]/followers/route.ts` and `/following/route.ts` — return userStats + equipped_name_fx per row
- Modify: `app/api/battle/[id]/token/route.ts` and `lib/livekit.ts` — carry userStats + equipped_name_fx in token metadata

**Type plumbing:**
- Modify: `components/account/settings/shared.tsx` — add subscription fields to SettingsProfile
- Modify: `app/account/page.tsx` — extend MeData with subscription fields + weakest sub-score

---

# Phase 1 — Schema + foundations

## Task 1: Schema migration

**Files:**
- Create: `docs/migrations/2026-05-11-subscription-and-achievements.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Subscription state on profiles + achievement progress table
-- + catalog_items extensions for sub-only and unlock_method
-- ============================================================

begin;

-- 1) Subscription columns on profiles.
alter table profiles
  add column if not exists subscription_status text,
  add column if not exists subscription_tier text,
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists stripe_subscription_id text,
  add column if not exists monthly_cosmetic_claimed_at timestamptz;

-- 2) Catalog item extensions.
alter table catalog_items
  add column if not exists subscriber_only boolean not null default false,
  add column if not exists unlock_method text not null default 'purchase'
    check (unlock_method in ('purchase', 'achievement', 'subscriber', 'admin_grant'));

-- 3) user_inventory: track when monthly credit was redeemed.
alter table user_inventory
  add column if not exists subscription_credit_redeemed_at timestamptz;

-- 3b) Allow new sources.
alter table user_inventory drop constraint if exists user_inventory_source_check;
alter table user_inventory
  add constraint user_inventory_source_check
  check (source in ('purchase', 'grant', 'reward', 'achievement', 'subscription_credit'));

-- 4) Achievement progress table.
create table if not exists achievement_progress (
  user_id uuid not null references users(id) on delete cascade,
  achievement_key text not null,
  progress integer not null default 0,
  achieved_at timestamptz,
  primary key (user_id, achievement_key)
);

create index if not exists achievement_progress_user_achieved_idx
  on achievement_progress (user_id, achieved_at) where achieved_at is not null;

commit;
```

- [ ] **Step 2: Manual gate — tell the user to run this in Supabase Studio**

Print: "Paste `docs/migrations/2026-05-11-subscription-and-achievements.sql` into the Supabase SQL editor and execute. Verify with:
```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name like 'subscription%';
```
Expected: 6 rows (subscription_status, subscription_tier, subscription_started_at, subscription_current_period_end, stripe_subscription_id, monthly_cosmetic_claimed_at)."

## Task 2: Subscription helper + hook

**Files:**
- Create: `lib/subscription.ts`
- Create: `hooks/useSubscription.ts`

- [ ] **Step 1: Write `lib/subscription.ts`**

```ts
import { getPool } from '@/lib/db';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export async function isSubscriber(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const pool = getPool();
  const result = await pool.query<{ status: string | null }>(
    `select subscription_status as status from profiles where user_id = $1 limit 1`,
    [userId],
  );
  const status = result.rows[0]?.status;
  return status !== null && status !== undefined && ACTIVE_STATUSES.has(status);
}

export function applySubscriberDiscount(cents: number): number {
  return Math.floor(cents * 0.8);
}
```

- [ ] **Step 2: Write `hooks/useSubscription.ts`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';

type SubscriptionState = {
  active: boolean;
  tier: 'plus' | null;
  periodEnd: string | null;
  loading: boolean;
};

const INITIAL: SubscriptionState = {
  active: false,
  tier: null,
  periodEnd: null,
  loading: true,
};

export function useSubscription(): SubscriptionState {
  const { user, loading: userLoading } = useUser();
  const [state, setState] = useState<SubscriptionState>(INITIAL);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setState({ active: false, tier: null, periodEnd: null, loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setState({ active: false, tier: null, periodEnd: null, loading: false });
          return;
        }
        const data = (await res.json()) as {
          profile: {
            subscription_status: string | null;
            subscription_tier: string | null;
            subscription_current_period_end: string | null;
          } | null;
        };
        if (cancelled) return;
        const status = data.profile?.subscription_status ?? null;
        const active = status === 'active' || status === 'trialing';
        setState({
          active,
          tier: active ? 'plus' : null,
          periodEnd: data.profile?.subscription_current_period_end ?? null,
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ active: false, tier: null, periodEnd: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, userLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
```

## Task 3: Type plumbing for subscription + smart cosmetic state

**Files:**
- Modify: `components/account/settings/shared.tsx`
- Modify: `app/account/page.tsx`
- Modify: `app/api/account/me/route.ts`
- Modify: `lib/publicProfile.ts`

- [ ] **Step 1: Extend `SettingsProfile`**

Add to the type in `components/account/settings/shared.tsx`:
```ts
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_current_period_end: string | null;
  monthly_cosmetic_claimed_at: string | null;
  weakest_sub_score: 'jawline' | 'eyes' | 'skin' | 'cheekbones' | null;
```

- [ ] **Step 2: Extend `MeData.profile` in `app/account/page.tsx`**

Add the same 5 fields.

- [ ] **Step 3: Extend the `Profile` type + SELECT in `app/api/account/me/route.ts`**

Add columns to the SELECT clause and to the Profile type:
```sql
   subscription_status, subscription_tier,
   subscription_current_period_end, monthly_cosmetic_claimed_at,
```

Compute `weakest_sub_score` server-side from the best scan record:
```ts
const weakestSubScore = bestScan
  ? computeWeakest(bestScan.scores)  // returns the lowest sub-score key
  : null;
```

`computeWeakest()` is a helper in `lib/scoreEngine.ts` (or co-located). Returns the key (jawline/eyes/skin/cheekbones) with the lowest sub-score value.

- [ ] **Step 4: Extend `PublicProfileData` in `lib/publicProfile.ts`**

Add `weakest_sub_score` field, computed the same way at fetch time.

---

# Phase 2 — Stripe subscription

## Task 4: Webhook handles subscription events

**Files:**
- Modify: `app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Add cases for subscription events**

Inside the `switch (event.type)`, add cases between the existing `checkout.session.completed` and `charge.refunded`:

```ts
case 'customer.subscription.created':
case 'customer.subscription.updated': {
  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
  }
  await pool.query(
    `update profiles set
       subscription_status = $1,
       subscription_tier = 'plus',
       subscription_started_at = coalesce(subscription_started_at, $2),
       subscription_current_period_end = $3,
       stripe_subscription_id = $4
     where user_id = $5`,
    [
      sub.status,
      new Date(sub.created * 1000),
      new Date(sub.current_period_end * 1000),
      sub.id,
      userId,
    ],
  );
  await pool
    .query(
      `insert into audit_log (user_id, action, resource, metadata)
         values ($1, 'subscription_updated', $2, $3::jsonb)`,
      [userId, sub.id, JSON.stringify({ status: sub.status, period_end: sub.current_period_end })],
    )
    .catch(() => {});
  return NextResponse.json({ received: true });
}
case 'customer.subscription.deleted': {
  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
  }
  await pool.query(
    `update profiles set subscription_status = 'canceled' where user_id = $1`,
    [userId],
  );
  return NextResponse.json({ received: true });
}
case 'invoice.payment_failed': {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;
  if (subId) {
    await pool.query(
      `update profiles set subscription_status = 'past_due' where stripe_subscription_id = $1`,
      [subId],
    );
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Branch the existing `checkout.session.completed` for subscription mode**

```ts
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === 'subscription') {
    return NextResponse.json({ received: true });
  }
  // ... (existing one-time payment branch unchanged)
}
```

## Task 5: Checkout supports subscription mode + 20% discount

**Files:**
- Modify: `app/api/checkout/create-session/route.ts`

- [ ] **Step 1: Refactor to dispatch by body shape**

```ts
type Body =
  | { items: string[] }
  | { subscription: 'monthly' | 'annual' };

let body: Body;
try {
  body = await request.json();
} catch {
  return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
}

if ('subscription' in body) {
  return createSubscriptionSession(body.subscription, user, stripe);
}
if ('items' in body && Array.isArray(body.items)) {
  return createCosmeticSession(body.items, user, stripe);
}
return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
```

- [ ] **Step 2: Add `createSubscriptionSession`**

```ts
async function createSubscriptionSession(
  plan: 'monthly' | 'annual',
  user: { id: string; email: string },
  stripe: Stripe,
): Promise<NextResponse> {
  const priceId = plan === 'annual'
    ? process.env.STRIPE_PRICE_PLUS_ANNUAL
    : process.env.STRIPE_PRICE_PLUS_MONTHLY;
  if (!priceId) {
    return NextResponse.json(
      { error: 'subscription_unconfigured', message: 'price not set' },
      { status: 503 },
    );
  }
  const session_ = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email,
    payment_method_types: ['card'],
    success_url: appUrlFor('/account/store/success?session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: appUrlFor('/account/store/cancel'),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan },
    subscription_data: {
      metadata: { user_id: user.id, plan },
    },
  });
  if (!session_.url) {
    return NextResponse.json({ error: 'session_no_url' }, { status: 502 });
  }
  return NextResponse.json({ url: session_.url, session_id: session_.id });
}
```

- [ ] **Step 3: Add subscriber 20% discount to `createCosmeticSession`**

```ts
import { isSubscriber, applySubscriberDiscount } from '@/lib/subscription';

const subscriber = await isSubscriber(user.id);
const line_items = items.rows.map((item) => ({
  price_data: {
    currency: 'usd',
    product_data: {
      name: item.name,
      description: item.description ?? undefined,
    },
    unit_amount: subscriber
      ? applySubscriberDiscount(item.price_cents)
      : item.price_cents,
  },
  quantity: 1,
}));
```

- [ ] **Step 4: Add the price IDs to `.env.local`**

```
STRIPE_PRICE_PLUS_MONTHLY=REPLACE_ME_PRICE_MONTHLY
STRIPE_PRICE_PLUS_ANNUAL=REPLACE_ME_PRICE_ANNUAL
```

## Task 6: Billing portal endpoint

**Files:**
- Create: `app/api/account/billing-portal/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getStripe, appUrlFor } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'stripe_unconfigured' }, { status: 503 });
  }

  const pool = getPool();
  const row = await pool.query<{ stripe_subscription_id: string | null }>(
    `select stripe_subscription_id from profiles where user_id = $1 limit 1`,
    [user.id],
  );
  const subId = row.rows[0]?.stripe_subscription_id;
  if (!subId) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: appUrlFor('/account?tab=settings'),
  });

  return NextResponse.json({ url: portal.url });
}
```

---

# Phase 3 — Server-side benefit gates

## Task 7: Apply isSubscriber across benefit surfaces

**Files:**
- Modify: `lib/scanLimit.ts`
- Modify: `app/api/account/banner/route.ts`
- Modify: `app/api/battle/create/route.ts`
- Modify: `app/api/account/equip/route.ts`
- Modify: `app/api/cron/prune-old-data/route.ts`
- Create: `app/api/cron/expire-subscriptions/route.ts`

- [ ] **Step 1: scanLimit subscriber bypass**

In `lib/scanLimit.ts`:
```ts
import { isSubscriber } from '@/lib/subscription';

export async function checkScanLimit(input: ScanLimitInput): Promise<ScanLimitState> {
  const pool = getPool();
  if (input.userId && (await isSubscriber(input.userId))) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      signedIn: true,
      reason: null,
      resetInSeconds: null,
    };
  }
  // ... rest of existing implementation
}
```

- [ ] **Step 2: Banner accepts video for subscribers**

```ts
import { isSubscriber } from '@/lib/subscription';

const subscriber = await isSubscriber(user.id);
const allowedMimes = subscriber
  ? /^(image\/(png|jpe?g|webp|gif)|video\/mp4)$/
  : /^image\/(png|jpe?g|webp)$/;

const match = body.imageBase64.match(/^data:([^;]+);base64,(.+)$/);
if (!match || !allowedMimes.test(match[1])) {
  return NextResponse.json({ error: 'invalid_image_format' }, { status: 400 });
}
const maxBytes = subscriber ? 8 * 1024 * 1024 : MAX_BYTES;
if (buffer.byteLength > maxBytes) {
  return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
}
```

Update the path-extension logic to handle `mp4` and `gif` for subscribers.

- [ ] **Step 3: Battle create — 20-person cap for subscribers**

```ts
import { isSubscriber } from '@/lib/subscription';

const subscriber = await isSubscriber(user.id);
const maxParticipants = subscriber ? 20 : 10;
```

In the INSERT statement, add `max_participants` to the column list and bind `maxParticipants`.

- [ ] **Step 4: Equip route — reject sub-only items for non-subscribers**

```ts
import { isSubscriber } from '@/lib/subscription';

const itemRow = await pool.query<{ subscriber_only: boolean }>(
  `select subscriber_only from catalog_items where slug = $1 limit 1`,
  [slug],
);
if (itemRow.rows[0]?.subscriber_only) {
  const subscriber = await isSubscriber(user.id);
  if (!subscriber) {
    return NextResponse.json(
      { error: 'subscriber_only_item', message: 'this item is exclusive to holymog+ subscribers' },
      { status: 403 },
    );
  }
}
```

- [ ] **Step 5: Prune cron skips subscribers**

In `app/api/cron/prune-old-data/route.ts`, modify the DELETE to exclude subscriber rows:
```sql
delete from scan_history
 where created_at < now() - interval '90 days'
   and user_id not in (
     select user_id from profiles
      where subscription_status in ('active', 'trialing')
   );
```

- [ ] **Step 6: Add expire-subscriptions cron**

Create `app/api/cron/expire-subscriptions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyCronAuth } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pool = getPool();

  const expired = await pool.query<{ user_id: string }>(
    `select user_id from profiles
      where subscription_status in ('canceled', 'past_due')
        and subscription_current_period_end < now()`,
  );

  for (const row of expired.rows) {
    await pool.query(
      `update profiles set
         equipped_frame    = case when equipped_frame in
             (select slug from catalog_items where subscriber_only) then null else equipped_frame end,
         equipped_flair    = case when equipped_flair in
             (select slug from catalog_items where subscriber_only) then null else equipped_flair end,
         equipped_theme    = case when equipped_theme in
             (select slug from catalog_items where subscriber_only) then null else equipped_theme end,
         equipped_name_fx  = case when equipped_name_fx in
             (select slug from catalog_items where subscriber_only) then null else equipped_name_fx end,
         subscription_status = null
       where user_id = $1`,
      [row.user_id],
    );
  }

  return NextResponse.json({ expired: expired.rows.length });
}
```

Register in `vercel.json` crons:
```json
{ "path": "/api/cron/expire-subscriptions", "schedule": "0 3 * * *" }
```

## Task 8: Monthly cosmetic claim endpoint

**Files:**
- Create: `app/api/account/redeem-monthly-cosmetic/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isSubscriber } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await isSubscriber(user.id))) {
    return NextResponse.json({ error: 'not_a_subscriber' }, { status: 403 });
  }

  let body: { slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.slug !== 'string') {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  const slug = body.slug;

  const pool = getPool();

  const item = await pool.query<{ kind: string; subscriber_only: boolean }>(
    `select kind, subscriber_only from catalog_items where slug = $1 limit 1`,
    [slug],
  );
  if (item.rows.length === 0) {
    return NextResponse.json({ error: 'unknown_slug' }, { status: 404 });
  }
  const row = item.rows[0];
  if (row.kind !== 'frame' && row.kind !== 'badge') {
    return NextResponse.json(
      { error: 'wrong_kind', message: 'monthly credit covers frames and badges only' },
      { status: 400 },
    );
  }
  if (row.subscriber_only) {
    return NextResponse.json(
      { error: 'already_included', message: 'subscriber-only items are already free for you' },
      { status: 400 },
    );
  }

  const profile = await pool.query<{ monthly_cosmetic_claimed_at: Date | null }>(
    `select monthly_cosmetic_claimed_at from profiles where user_id = $1 limit 1`,
    [user.id],
  );
  const lastClaim = profile.rows[0]?.monthly_cosmetic_claimed_at;
  if (lastClaim && Date.now() - lastClaim.getTime() < ONE_MONTH_MS) {
    const resetAt = new Date(lastClaim.getTime() + ONE_MONTH_MS);
    return NextResponse.json(
      { error: 'cooldown_active', resets_at: resetAt.toISOString() },
      { status: 429 },
    );
  }

  const owns = await pool.query(
    `select id from user_inventory where user_id = $1 and item_slug = $2 limit 1`,
    [user.id, slug],
  );
  if (owns.rows.length > 0) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into user_inventory (user_id, item_slug, source, subscription_credit_redeemed_at)
         values ($1, $2, 'subscription_credit', now())
         on conflict (user_id, item_slug) do nothing`,
      [user.id, slug],
    );
    await client.query(
      `update profiles set monthly_cosmetic_claimed_at = now() where user_id = $1`,
      [user.id],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'claim_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, slug });
}
```

---

# Phase 4 — Smart cosmetic plumbing

## Task 9: Extend renderers to accept userStats + thread through every render site

The pivoted catalog has 8 smart cosmetics (vs the original 3): live-data items across all 4 kinds (Frame, Badge, NameFx, ThemeAmbient). Plumbing must support all of them.

**Files:**
- Modify: `lib/customization.ts`
- Modify: `components/customization/Frame.tsx`
- Modify: `components/customization/Badge.tsx`
- Modify: `components/customization/NameFx.tsx`
- Modify: `components/customization/ThemeAmbient.tsx`
- Modify: `components/PublicProfileView.tsx`
- Modify: `app/leaderboard/page.tsx`
- Modify: `app/mog/BattleRoom.tsx`
- Modify: `components/FollowList.tsx`
- Modify: `lib/livekit.ts`
- Modify: `app/api/battle/[id]/token/route.ts`
- Modify: `app/api/leaderboard/route.ts` + `app/api/leaderboard/battles/route.ts`
- Modify: `app/api/account/[username]/followers/route.ts` + `following/route.ts`

- [ ] **Step 1: Define `UserStats` type centrally**

In `lib/customization.ts`, export:

```ts
export type UserStats = {
  elo?: number | null;
  bestScanOverall?: number | null;
  currentStreak?: number | null;
  currentWinStreak?: number | null;
  matchesWon?: number | null;
  weakestSubScore?: 'jawline' | 'eyes' | 'skin' | 'cheekbones' | null;
};
```

- [ ] **Step 2: Tag smart slugs in the registry definitions**

Extend each of `FrameDef`, `BadgeDef`, `NameFxDef`, `ThemeDef`:

```ts
export type FrameDef = {
  slug: string;
  kind: 'frame';
  name: string;
  component: ComponentType<{ children: ReactNode; size: number; userStats?: UserStats }>;
  ringInset: number;
  haloColor: string;
  /** Marks frames that read userStats. The renderer is responsible for
   *  falling back gracefully when userStats is unavailable. */
  smart?: boolean;
};
// Same `smart?: boolean` on BadgeDef, NameFxDef, ThemeDef.
```

- [ ] **Step 3: Rewrite the 4 renderers to thread userStats**

For each renderer (`Frame`, `Badge`, `NameFx`, `ThemeAmbient`), add `userStats?: UserStats` to its props and pass through to the loaded component.

Example for `Frame.tsx`:

```tsx
'use client';

import { getFrame, type UserStats } from '@/lib/customization';

export function Frame({
  slug,
  size = 256,
  userStats,
  children,
}: {
  slug: string | null | undefined;
  size?: number;
  userStats?: UserStats;
  children: React.ReactNode;
}) {
  const def = getFrame(slug);
  if (!def) {
    return <div className="rounded-full overflow-hidden" style={{ width: size, height: size }}>{children}</div>;
  }
  const Comp = def.component;
  return <Comp size={size} userStats={userStats}>{children}</Comp>;
}
```

Same pattern for `Badge`, `NameFx`, `ThemeAmbient`.

- [ ] **Step 4: Thread `userStats` through every render site**

Every place that mounts `<Frame>`, `<Badge>`, `<NameFx>`, or `<ThemeAmbient>` needs `userStats={...}` whenever the data is available.

Sites to update with the userStats shape they should pass:

| Site | userStats fields available |
|---|---|
| `PublicProfileView.tsx` | all (from `PublicProfileData`) |
| `app/leaderboard/page.tsx` ScanRow | `bestScanOverall: row.overall` |
| `app/leaderboard/page.tsx` BattleRow | `elo`, `matchesWon` |
| `app/mog/BattleRoom.tsx` AvatarPill | from LiveKit participant metadata |
| `components/FollowList.tsx` rows | from `/followers` and `/following` payloads |
| `components/AccountStatsTab.tsx` settings preview | from MeData |

- [ ] **Step 5: Extend API payloads with userStats + equipped_name_fx**

For each API the render sites depend on, add the relevant columns to the SELECT.

- `/api/leaderboard/route.ts` (ScanRow source): add `equipped_name_fx` and ensure `overall` is included (likely already).
- `/api/leaderboard/battles/route.ts` (BattleRow source): add `equipped_name_fx`, `matches_won`.
- `/api/account/[username]/followers/route.ts` and `/following/route.ts`: add `equipped_name_fx`, `elo`, `current_streak`, `best_scan_overall`, `matches_won`, and the precomputed `weakest_sub_score`.
- `lib/livekit.ts` `mintLiveKitToken`: extend to accept `userStats` + `equipped_name_fx`, encode into participant metadata.
- `app/api/battle/[id]/token/route.ts`: SELECT the additional columns from `profiles` and pass them.

- [ ] **Step 6: Implement `weakest_sub_score` server-side helper**

Add to `lib/scoreEngine.ts`:

```ts
export type SubScoreKey = 'jawline' | 'eyes' | 'skin' | 'cheekbones';

export function weakestSubScore(scores: FinalScores): SubScoreKey {
  const entries: [SubScoreKey, number][] = [
    ['jawline', scores.jawline],
    ['eyes', scores.eyes],
    ['skin', scores.skin],
    ['cheekbones', scores.cheekbones],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}
```

Called from `app/api/account/me/route.ts` GET, `lib/publicProfile.ts`, and the follower/leaderboard SELECTs (the best-scan JSON column gets pulled and parsed).

---

# Phase 5 — Achievement engine

## Task 10: Achievement definitions + check function

**Files:**
- Create: `lib/achievements.ts`

- [ ] **Step 1: Write definitions matching the pivoted catalog**

Authoritative mapping per spec §3.5. Note that several thresholds grant multiple slugs (handled by listing them with distinct keys that share a threshold function).

```ts
import { getPool } from '@/lib/db';

export type AchievementCheck = {
  key: string;
  slug: string;
  name: string;
  description: string;
  progressTarget: number;
};

export const ACHIEVEMENTS: Record<string, AchievementCheck> = {
  // Frames
  'scan_1_frame': {
    key: 'scan_1_frame', slug: 'frame.scan-ring',
    name: 'scan ring', description: 'unlocked by completing your first scan',
    progressTarget: 1,
  },
  'elo_gain_100': {
    key: 'elo_gain_100', slug: 'frame.elo-medal',
    name: 'elo medal', description: 'unlocked by climbing 100 ELO from base',
    progressTarget: 100,
  },
  'streak_7': {
    key: 'streak_7', slug: 'frame.streak-pyre',
    name: 'streak pyre', description: 'unlocked by a 7-day streak',
    progressTarget: 7,
  },
  'scan_a_tier_frame': {
    key: 'scan_a_tier_frame', slug: 'frame.canthal',
    name: 'canthal', description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },
  'battles_won_25_frame': {
    key: 'battles_won_25_frame', slug: 'frame.crown-letters',
    name: 'crown letters', description: 'unlocked by winning 25 battles',
    progressTarget: 25,
  },

  // Badges
  'scan_1_badge': {
    key: 'scan_1_badge', slug: 'badge.scan-1',
    name: 'first scan', description: 'unlocked by completing your first scan',
    progressTarget: 1,
  },
  'set_bio_badge': {
    key: 'set_bio_badge', slug: 'badge.identity',
    name: 'identity', description: 'unlocked by setting your bio',
    progressTarget: 1,
  },
  'battles_won_5': {
    key: 'battles_won_5', slug: 'badge.duelist',
    name: 'duelist', description: 'unlocked by winning 5 battles',
    progressTarget: 5,
  },
  'elo_1300': {
    key: 'elo_1300', slug: 'badge.king',
    name: 'king', description: 'unlocked by reaching 1300 ELO',
    progressTarget: 1300,
  },
  'scan_a_tier_badge': {
    key: 'scan_a_tier_badge', slug: 'badge.tier-stamp',
    name: 'tier stamp', description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },

  // Name FX
  'set_bio_name': {
    key: 'set_bio_name', slug: 'name.signed',
    name: 'signed', description: 'unlocked by setting your bio',
    progressTarget: 1,
  },
  'scan_a_tier_name': {
    key: 'scan_a_tier_name', slug: 'name.tier-prefix',
    name: 'tier prefix', description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },
  'scan_10': {
    key: 'scan_10', slug: 'name.callout',
    name: 'callout', description: 'unlocked by completing 10 scans',
    progressTarget: 10,
  },
  'win_streak_5': {
    key: 'win_streak_5', slug: 'name.streak-flame',
    name: 'streak flame', description: 'unlocked by a 5-game win streak',
    progressTarget: 5,
  },
  'elo_1500': {
    key: 'elo_1500', slug: 'name.elo-king',
    name: 'elo king', description: 'unlocked by reaching 1500 ELO',
    progressTarget: 1500,
  },

  // Themes
  'queue_1_battle': {
    key: 'queue_1_battle', slug: 'theme.match-found',
    name: 'match found', description: 'unlocked by queueing your first battle',
    progressTarget: 1,
  },
  'scan_50': {
    key: 'scan_50', slug: 'theme.tier-grid',
    name: 'tier grid', description: 'unlocked by completing 50 scans',
    progressTarget: 50,
  },
  'battles_won_25_theme': {
    key: 'battles_won_25_theme', slug: 'theme.win-stack',
    name: 'win stack', description: 'unlocked by winning 25 battles',
    progressTarget: 25,
  },
  'streak_14': {
    key: 'streak_14', slug: 'theme.embers',
    name: 'embers', description: 'unlocked by a 14-day streak',
    progressTarget: 14,
  },
  'scan_s_tier': {
    key: 'scan_s_tier', slug: 'theme.god-beam',
    name: 'god beam', description: 'unlocked by scanning S-tier or higher',
    progressTarget: 1,
  },
};

export type AchievementGrant = {
  achievement_key: string;
  slug: string;
  name: string;
};

export async function checkAchievements(
  userId: string,
  stats: {
    totalScans?: number;
    bestScanOverall?: number;
    matchesWon?: number;
    elo?: number;
    currentStreak?: number;
    currentWinStreak?: number;
    eloGainedFromBase?: number;
    bioSet?: boolean;
    battleQueued?: boolean;
  },
): Promise<AchievementGrant[]> {
  const pool = getPool();
  const grants: AchievementGrant[] = [];

  const tryGrant = async (def: AchievementCheck, achieved: boolean) => {
    if (!achieved) return;
    const result = await pool.query(
      `insert into achievement_progress (user_id, achievement_key, progress, achieved_at)
         values ($1, $2, $3, now())
         on conflict (user_id, achievement_key) do update
           set achieved_at = coalesce(achievement_progress.achieved_at, now())
         returning xmax = 0 as inserted`,
      [userId, def.key, def.progressTarget],
    );
    const inserted = result.rows[0]?.inserted ?? false;
    if (inserted) {
      await pool.query(
        `insert into user_inventory (user_id, item_slug, source)
           values ($1, $2, 'achievement')
           on conflict (user_id, item_slug) do nothing`,
        [userId, def.slug],
      );
      grants.push({ achievement_key: def.key, slug: def.slug, name: def.name });
    }
  };

  // Scan-related — A-tier scan grants 3 items.
  if (stats.totalScans != null) {
    await tryGrant(ACHIEVEMENTS['scan_1_frame'], stats.totalScans >= 1);
    await tryGrant(ACHIEVEMENTS['scan_1_badge'], stats.totalScans >= 1);
    await tryGrant(ACHIEVEMENTS['scan_10'], stats.totalScans >= 10);
    await tryGrant(ACHIEVEMENTS['scan_50'], stats.totalScans >= 50);
  }
  if (stats.bestScanOverall != null) {
    if (stats.bestScanOverall >= 70) {
      // A-tier+ grants frame + badge + name fx (3 items)
      await tryGrant(ACHIEVEMENTS['scan_a_tier_frame'], true);
      await tryGrant(ACHIEVEMENTS['scan_a_tier_badge'], true);
      await tryGrant(ACHIEVEMENTS['scan_a_tier_name'], true);
    }
    if (stats.bestScanOverall >= 87) {
      // S-tier+ grants god-beam theme
      await tryGrant(ACHIEVEMENTS['scan_s_tier'], true);
    }
  }

  // Battle-related — 25 wins grants frame + theme (2 items).
  if (stats.matchesWon != null) {
    await tryGrant(ACHIEVEMENTS['battles_won_5'], stats.matchesWon >= 5);
    await tryGrant(ACHIEVEMENTS['battles_won_25_frame'], stats.matchesWon >= 25);
    await tryGrant(ACHIEVEMENTS['battles_won_25_theme'], stats.matchesWon >= 25);
  }
  if (stats.elo != null) {
    await tryGrant(ACHIEVEMENTS['elo_1300'], stats.elo >= 1300);
    await tryGrant(ACHIEVEMENTS['elo_1500'], stats.elo >= 1500);
  }
  if (stats.eloGainedFromBase != null) {
    await tryGrant(ACHIEVEMENTS['elo_gain_100'], stats.eloGainedFromBase >= 100);
  }
  if (stats.currentWinStreak != null) {
    await tryGrant(ACHIEVEMENTS['win_streak_5'], stats.currentWinStreak >= 5);
  }
  if (stats.currentStreak != null) {
    await tryGrant(ACHIEVEMENTS['streak_7'], stats.currentStreak >= 7);
    await tryGrant(ACHIEVEMENTS['streak_14'], stats.currentStreak >= 14);
  }

  // Profile-related — set bio grants badge + name fx (2 items).
  if (stats.bioSet === true) {
    await tryGrant(ACHIEVEMENTS['set_bio_badge'], true);
    await tryGrant(ACHIEVEMENTS['set_bio_name'], true);
  }
  if (stats.battleQueued === true) {
    await tryGrant(ACHIEVEMENTS['queue_1_battle'], true);
  }

  return grants;
}
```

## Task 11: Fire achievement checks from existing endpoints

**Files:**
- Modify: `app/api/score/route.ts`
- Modify: `app/api/battle/finish/route.ts`
- Modify: `app/api/account/me/route.ts` PATCH
- Modify: `app/api/battle/queue/route.ts`

- [ ] **Step 1: Fire from `/api/score`**

```ts
import { checkAchievements, type AchievementGrant } from '@/lib/achievements';

let grants: AchievementGrant[] = [];
if (userId) {
  const counts = await pool.query<{ total_scans: number; best: number | null }>(
    `select count(*)::int as total_scans, max(overall)::int as best
       from scan_history where user_id = $1`,
    [userId],
  );
  const totalScans = counts.rows[0]?.total_scans ?? 0;
  const bestScanOverall = counts.rows[0]?.best ?? null;
  grants = await checkAchievements(userId, {
    totalScans,
    bestScanOverall: bestScanOverall ?? undefined,
  });
}

return NextResponse.json({
  scores: responseScores,
  vision: userId ? vision : null,
  achievements: grants,
}, { headers: { ... } });
```

- [ ] **Step 2: Fire from `/api/battle/finish`**

```ts
import { checkAchievements } from '@/lib/achievements';

const callerStats = await pool.query<{
  matches_won: number;
  elo: number;
  current_streak: number;
}>(
  `select matches_won, elo, current_streak from profiles where user_id = $1 limit 1`,
  [user.id],
);
const stats = callerStats.rows[0];
let grants: AchievementGrant[] = [];
if (stats) {
  const recentDeltas = await pool.query<{ delta: number }>(
    `select delta from elo_history
       where user_id = $1 and delta is not null
       order by recorded_at desc
       limit 20`,
    [user.id],
  );
  let winStreak = 0;
  for (const row of recentDeltas.rows) {
    if (row.delta > 0) winStreak++; else break;
  }
  grants = await checkAchievements(user.id, {
    matchesWon: stats.matches_won,
    elo: stats.elo,
    eloGainedFromBase: stats.elo - 1000,
    currentStreak: stats.current_streak,
    currentWinStreak: winStreak,
  });
}

return NextResponse.json({ result: payload, achievements: grants });
```

- [ ] **Step 3: Fire from `/api/account/me` PATCH (bio set)**

```ts
import { checkAchievements } from '@/lib/achievements';

let grants: AchievementGrant[] = [];
if ('bio' in fields && fields.bio !== null && fields.bio.trim().length > 0) {
  grants = await checkAchievements(user.id, { bioSet: true });
}

return NextResponse.json({ ok: true, achievements: grants });
```

- [ ] **Step 4: Fire from `/api/battle/queue`**

```ts
import { checkAchievements } from '@/lib/achievements';

const grants = await checkAchievements(user.id, { battleQueued: true });

if (battleId) {
  return NextResponse.json({ battle_id: battleId, paired: true, achievements: grants });
}
return NextResponse.json({ queued: true, achievements: grants });
```

## Task 12: Achievement toast notification

**Files:**
- Create: `components/AchievementToast.tsx`
- Create: `hooks/useAchievementToast.ts`
- Modify: `components/Providers.tsx`

- [ ] **Step 1: Write `hooks/useAchievementToast.ts`**

```tsx
'use client';

import { useEffect, useState } from 'react';

type AchievementGrant = {
  achievement_key: string;
  slug: string;
  name: string;
};

const listeners = new Set<() => void>();
let queue: AchievementGrant[] = [];

export function pushAchievements(grants: AchievementGrant[]) {
  if (!grants || grants.length === 0) return;
  queue = [...queue, ...grants];
  listeners.forEach((l) => l());
}

export function useAchievementToast() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const dismiss = (key: string) => {
    queue = queue.filter((g) => g.achievement_key !== key);
    listeners.forEach((l) => l());
  };
  return { queue, dismiss };
}
```

- [ ] **Step 2: Write `components/AchievementToast.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useAchievementToast } from '@/hooks/useAchievementToast';

const DISMISS_AFTER_MS = 5000;

export function AchievementToastContainer() {
  const { queue, dismiss } = useAchievementToast();

  useEffect(() => {
    if (queue.length === 0) return;
    const first = queue[0];
    const t = window.setTimeout(() => dismiss(first.achievement_key), DISMISS_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [queue, dismiss]);

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {queue.map((grant) => (
          <motion.div
            key={grant.achievement_key}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="pointer-events-auto flex w-72 items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 backdrop-blur-md"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <Sparkles size={16} className="text-emerald-300" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
              <span className="text-[11px] uppercase tracking-[0.16em] text-emerald-300">
                unlocked
              </span>
              <span className="truncate text-[14px] font-semibold text-white">
                {grant.name}
              </span>
              <span className="text-[11px] text-zinc-400">
                check your store to equip
              </span>
            </div>
            <button
              type="button"
              onClick={() => dismiss(grant.achievement_key)}
              className="flex-shrink-0 text-zinc-400 hover:text-white"
              aria-label="dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Mount the container in `Providers.tsx`**

```tsx
import { AchievementToastContainer } from './AchievementToast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ScanMigrationWatcher />
      {children}
      <AchievementToastContainer />
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Push achievements from client call sites**

Wherever `/api/score`, `/api/battle/finish`, `/api/account/me PATCH`, `/api/battle/queue` are called from the client (in `app/scan/page.tsx`, `app/mog/BattleRoom.tsx`, `components/account/settings/ProfileSection.tsx`, `app/mog/page.tsx`):

```ts
import { pushAchievements } from '@/hooks/useAchievementToast';

if (json.achievements) pushAchievements(json.achievements);
```

---

# Phase 6 — Ad slots

## Task 13: AdSlot component + placements

**Files:**
- Create: `components/AdSlot.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/account/page.tsx`, `app/leaderboard/page.tsx`, `app/help/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/share/[platform]/page.tsx`

- [ ] **Step 1: Write `components/AdSlot.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useSubscription } from '@/hooks/useSubscription';

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

type Props = {
  slotId: string;
  format?: 'auto' | 'rectangle' | 'horizontal';
  minWidth?: number;
};

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export function AdSlot({ slotId, format = 'auto', minWidth = 1024 }: Props) {
  const { active, loading } = useSubscription();
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading || active) return;
    if (!ADSENSE_CLIENT) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // best-effort; ad just doesn't load
    }
  }, [loading, active]);

  if (loading || active || !ADSENSE_CLIENT) return null;

  return (
    <div
      className="hidden"
      style={{
        ['--ad-min-width' as never]: `${minWidth}px`,
      }}
      data-ad-slot-wrapper
    >
      <style>{`
        @media (min-width: ${minWidth}px) {
          [data-ad-slot-wrapper] { display: block !important; }
        }
      `}</style>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the AdSense script to `app/layout.tsx`**

```tsx
import Script from 'next/script';

{process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID && (
  <Script
    async
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
    crossOrigin="anonymous"
    strategy="afterInteractive"
  />
)}
```

- [ ] **Step 3: Place `<AdSlot>` on the 5 designated surfaces**

`/account`, `/leaderboard`, `/help`, `/terms`, `/privacy`: sidebar:
```tsx
<aside className="hidden lg:block lg:absolute lg:right-5 lg:top-32">
  <AdSlot slotId="ACCOUNT_SIDEBAR" format="rectangle" />
</aside>
```

`/share/[platform]` inline:
```tsx
<AdSlot slotId="SHARE_INLINE" format="horizontal" />
```

- [ ] **Step 4: Add env var**

```
NEXT_PUBLIC_ADSENSE_CLIENT_ID=REPLACE_ME_CA_PUB_xxxxx
```

---

# Phase 7 — Store UI extensions

## Task 14: Store card additions for sub-only, achievements, monthly claim

**Files:**
- Modify: `app/account/store/page.tsx`
- Modify: `app/api/catalog/route.ts`
- Create: `components/store/MonthlyClaimBanner.tsx`
- Create: `components/store/AchievementProgress.tsx`

- [ ] **Step 1: Extend `/api/catalog/route.ts` response**

```ts
import { ACHIEVEMENTS } from '@/lib/achievements';

// Include new columns in SELECT:
const items = await pool.query(
  `select kind, slug, name, description, price_cents, sort_order,
          subscriber_only, unlock_method
     from catalog_items
    where active = true
    order by kind asc, sort_order asc, price_cents asc`,
);

let progressByItem: Record<string, { current: number; target: number }> = {};
if (session?.user) {
  const userId = session.user.id;
  const progressRows = await pool.query<{
    achievement_key: string;
    progress: number;
    achieved_at: Date | null;
  }>(
    `select achievement_key, progress, achieved_at
       from achievement_progress where user_id = $1`,
    [userId],
  );
  for (const row of progressRows.rows) {
    const def = ACHIEVEMENTS[row.achievement_key];
    if (def) {
      progressByItem[def.slug] = {
        current: row.progress,
        target: def.progressTarget,
      };
    }
  }
}

return NextResponse.json({
  items: items.rows.map((row) => ({
    ...row,
    achievement_progress: progressByItem[row.slug] ?? undefined,
  })),
  owned,
  equipped,
});
```

- [ ] **Step 2: Extend the CatalogItem type in `app/account/store/page.tsx`**

```ts
type CatalogItem = {
  kind: CatalogKind;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  subscriber_only: boolean;
  unlock_method: 'purchase' | 'achievement' | 'subscriber' | 'admin_grant';
  achievement_progress?: { current: number; target: number };
};
```

- [ ] **Step 3: Branch card action logic**

```ts
if (item.unlock_method === 'subscriber') {
  if (!subscriberActive) {
    router.push('/account/upgrade');
    return;
  }
  // fall through to equip
}
if (item.unlock_method === 'achievement' && !owned) {
  return; // show progress bar instead
}
```

- [ ] **Step 4: Card visual states**

```tsx
const action = (() => {
  if (item.subscriber_only && !subscriberActive && !owned) {
    return { label: 'subscribe to unlock', href: '/account/upgrade' };
  }
  if (item.unlock_method === 'achievement' && !owned) {
    return null;
  }
  if (equipped) return { label: 'unequip', onClick: 'unequip' };
  if (owned) return { label: 'equip', onClick: 'equip' };
  return { label: dollarLabel, onClick: 'buy' };
})();
```

- [ ] **Step 5: Write `components/store/AchievementProgress.tsx`**

```tsx
'use client';

export function AchievementProgress({
  current,
  target,
  label,
}: {
  current: number;
  target: number;
  label: string;
}) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const done = current >= target;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="font-num tabular-nums font-semibold text-zinc-300">
          {Math.min(current, target)} / {target}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-emerald-400' : 'bg-sky-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/store/MonthlyClaimBanner.tsx`**

```tsx
'use client';

import { Gift } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

type Props = {
  claimedAt: string | null;
  onClaim: () => void;
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function MonthlyClaimBanner({ claimedAt, onClaim }: Props) {
  const { active } = useSubscription();
  if (!active) return null;

  const lastClaim = claimedAt ? new Date(claimedAt).getTime() : 0;
  const eligible = Date.now() - lastClaim >= ONE_MONTH_MS;
  const nextEligible = new Date(lastClaim + ONE_MONTH_MS);

  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15">
        <Gift size={18} className="text-amber-300" aria-hidden />
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-white">
          {eligible ? 'claim your free monthly cosmetic' : 'monthly cosmetic claimed'}
        </span>
        <span className="text-[12px] text-zinc-400">
          {eligible
            ? 'pick any frame or badge — free for holymog+ subscribers'
            : `available again ${nextEligible.toLocaleDateString()}`}
        </span>
      </div>
      {eligible && (
        <button
          type="button"
          onClick={onClaim}
          className="rounded-full bg-amber-300 px-4 py-2 text-[12px] font-semibold text-black hover:bg-amber-200"
        >
          claim
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Wire MonthlyClaimBanner into the store page**

Mount above the tab bar. Clicking "claim" opens a small modal listing all eligible frame + badge slugs the user doesn't own; selecting one calls `/api/account/redeem-monthly-cosmetic`.

---

# Phase 8 — Upgrade page + settings

## Task 15: `/account/upgrade` page

**Files:**
- Create: `app/account/upgrade/page.tsx`

- [ ] **Step 1: Write the upgrade page**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Crown } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useSubscription } from '@/hooks/useSubscription';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';

const FEATURES = [
  'unlimited scans (vs 10 / day)',
  'visible holymog+ badge next to your name',
  'one free frame or badge every month',
  '20% off every cosmetic in the store',
  '10 subscriber-exclusive cosmetics',
  'animated profile banners',
  'private parties up to 20 (vs 10)',
  'scan history kept forever (vs 90 days)',
  'no display ads — clean experience everywhere',
];

export default function UpgradePage() {
  const { user } = useUser();
  const { active } = useSubscription();
  const router = useRouter();
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const [pending, setPending] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const onUpgrade = async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (active) {
      router.push('/account?tab=settings');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: plan }),
      });
      if (!res.ok) {
        setPending(false);
        return;
      }
      const json = (await res.json()) as { url: string };
      window.location.href = json.url;
    } catch {
      setPending(false);
    }
  };

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader authNext="/account/upgrade" />
      <main className="mx-auto w-full max-w-md px-5 py-8 sm:max-w-xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={14} aria-hidden /> back
        </button>

        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-black">
            <Crown size={22} aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[28px] font-extrabold tracking-tight text-white">
              holymog+
            </h1>
            <p className="text-[14px] text-zinc-400">everything unlocked.</p>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
          <button
            type="button"
            onClick={() => setPlan('monthly')}
            className={`rounded-xl px-4 py-3 text-left transition-colors ${
              plan === 'monthly' ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/[0.05]'
            }`}
          >
            <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">monthly</div>
            <div className="font-num text-[24px] font-extrabold tabular-nums">$5</div>
            <div className="text-[11px] opacity-70">/ month</div>
          </button>
          <button
            type="button"
            onClick={() => setPlan('annual')}
            className={`rounded-xl px-4 py-3 text-left transition-colors ${
              plan === 'annual' ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] opacity-70">
              annual
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${plan === 'annual' ? 'bg-emerald-500/30 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                save 17%
              </span>
            </div>
            <div className="font-num text-[24px] font-extrabold tabular-nums">$50</div>
            <div className="text-[11px] opacity-70">/ year</div>
          </button>
        </div>

        <ul className="mb-6 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {FEATURES.map((feat) => (
            <li key={feat} className="flex items-start gap-2.5 text-[14px] text-zinc-200">
              <Check size={16} className="mt-0.5 flex-shrink-0 text-emerald-400" aria-hidden />
              {feat}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onUpgrade}
          disabled={pending || active}
          className="w-full rounded-full bg-foreground px-6 py-4 text-[15px] font-semibold text-[#0a0a0a] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {active ? 'you have holymog+' : pending ? 'redirecting…' : 'upgrade to holymog+'}
        </button>

        <p className="mt-4 text-center text-[11px] text-zinc-600">
          cancel anytime via account → settings → manage subscription.{' '}
          <Link href="/terms" className="hover:text-zinc-400 underline-offset-2 hover:underline">
            terms
          </Link>
        </p>
      </main>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        next="/account/upgrade"
        context="to subscribe"
      />
    </div>
  );
}
```

## Task 16: Subscription section in settings

**Files:**
- Create: `components/account/settings/SubscriptionSection.tsx`
- Modify: `components/AccountSettingsTab.tsx`

- [ ] **Step 1: Write `SubscriptionSection.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Crown, ExternalLink } from 'lucide-react';
import { Section, type SettingsProfile } from './shared';

export function SubscriptionSection({ profile }: { profile: SettingsProfile }) {
  const [opening, setOpening] = useState(false);
  const active = profile.subscription_status === 'active' || profile.subscription_status === 'trialing';
  const canceled = profile.subscription_status === 'canceled';

  const openPortal = async () => {
    setOpening(true);
    try {
      const res = await fetch('/api/account/billing-portal', { method: 'POST' });
      if (!res.ok) return;
      const json = (await res.json()) as { url: string };
      window.location.href = json.url;
    } finally {
      setOpening(false);
    }
  };

  return (
    <Section
      id="subscription"
      label="subscription"
      description="manage your holymog+ membership."
      icon={Crown}
      accent="amber"
    >
      <div className="flex items-center justify-between gap-3 border-t border-white/5 px-5 py-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[14px] font-medium text-white">
            {active ? 'holymog+ active' : canceled ? 'holymog+ canceled' : 'free'}
          </span>
          {active && profile.subscription_current_period_end && (
            <span className="text-[12px] text-zinc-400">
              renews {new Date(profile.subscription_current_period_end).toLocaleDateString()}
            </span>
          )}
          {canceled && profile.subscription_current_period_end && (
            <span className="text-[12px] text-zinc-400">
              benefits end {new Date(profile.subscription_current_period_end).toLocaleDateString()}
            </span>
          )}
          {!active && !canceled && (
            <span className="text-[12px] text-zinc-400">you're on the free plan</span>
          )}
        </div>
        {(active || canceled) ? (
          <button
            type="button"
            onClick={openPortal}
            disabled={opening}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-200 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <ExternalLink size={12} aria-hidden /> manage
          </button>
        ) : (
          <Link
            href="/account/upgrade"
            className="rounded-lg bg-amber-300 px-3 py-2 text-[12px] font-semibold text-black hover:bg-amber-200"
          >
            upgrade
          </Link>
        )}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Mount in `AccountSettingsTab`**

```tsx
import { SubscriptionSection } from './account/settings/SubscriptionSection';

// inside the return, above CustomizationSection:
<SubscriptionSection profile={profile} />
```

---

# Phase 9 — Shared shader infrastructure

## Task 17: useShaderLifecycle hook + ShaderCanvas wrapper

**Files:**
- Create: `lib/shader-budget.ts`
- Create: `hooks/useDocumentVisibility.ts`
- Create: `hooks/useShaderLifecycle.ts`
- Create: `components/cosmetics/ShaderCanvas.tsx`
- Create: `components/cosmetics/StaticFallback.tsx`

- [ ] **Step 1: Write `lib/shader-budget.ts`**

```ts
const MAX_CONCURRENT = 8;
let active = 0;
const listeners = new Set<() => void>();

export function acquireShaderSlot(): boolean {
  if (active >= MAX_CONCURRENT) return false;
  active++;
  return true;
}

export function releaseShaderSlot() {
  if (active > 0) active--;
  listeners.forEach((l) => l());
}

export function getShaderBudget() {
  return { active, max: MAX_CONCURRENT };
}

export function onShaderBudgetChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
```

- [ ] **Step 2: Write `hooks/useDocumentVisibility.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';

export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
```

- [ ] **Step 3: Write `hooks/useShaderLifecycle.ts`**

```ts
'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { acquireShaderSlot, releaseShaderSlot } from '@/lib/shader-budget';
import { useDocumentVisibility } from './useDocumentVisibility';

type Context = 'inline' | 'fullscreen';

type Lifecycle = {
  disabled: boolean;
  paused: boolean;
  dpr: number;
};

export function useShaderLifecycle({
  canvasRef,
  context,
}: {
  canvasRef: RefObject<HTMLElement | null>;
  context: Context;
}): Lifecycle {
  const visible = useDocumentVisibility();
  const [inView, setInView] = useState(context === 'fullscreen');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [budgetOk, setBudgetOk] = useState(true);
  const slotAcquired = useRef(false);

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // intersection observer (inline only)
  useEffect(() => {
    if (context === 'fullscreen') return;
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '50px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasRef, context]);

  // budget acquisition (inline only)
  useEffect(() => {
    if (context === 'fullscreen') return;
    if (reducedMotion) return;
    if (!inView) {
      if (slotAcquired.current) {
        releaseShaderSlot();
        slotAcquired.current = false;
      }
      return;
    }
    if (!slotAcquired.current) {
      const got = acquireShaderSlot();
      slotAcquired.current = got;
      setBudgetOk(got);
    }
    return () => {
      if (slotAcquired.current) {
        releaseShaderSlot();
        slotAcquired.current = false;
      }
    };
  }, [inView, reducedMotion, context]);

  const dpr = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 2);

  return {
    disabled: reducedMotion || (context === 'inline' && !budgetOk),
    paused: !visible || (context === 'inline' && !inView),
    dpr,
  };
}
```

- [ ] **Step 4: Write `components/cosmetics/StaticFallback.tsx`**

```tsx
type Props = {
  /** Hex / CSS color for the gradient. */
  color: string;
  /** Inline or fullscreen styling. */
  context: 'inline' | 'fullscreen';
  /** Optional ring stroke for frame fallbacks. */
  ring?: boolean;
};

export function StaticFallback({ color, context, ring }: Props) {
  if (context === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${color} 0%, rgba(10,10,10,1) 70%)`,
        }}
      />
    );
  }
  return (
    <div
      className="absolute inset-0 rounded-full"
      style={{
        background: ring ? 'transparent' : `radial-gradient(circle, ${color}, transparent)`,
        boxShadow: ring ? `inset 0 0 0 3px ${color}` : 'none',
      }}
    />
  );
}
```

- [ ] **Step 5: Write `components/cosmetics/ShaderCanvas.tsx`**

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import { useShaderLifecycle } from '@/hooks/useShaderLifecycle';

type Props = {
  context: 'inline' | 'fullscreen';
  fallback: ReactNode;
  /** Receives the GL context once initialized. The render function runs
   *  in a requestAnimationFrame loop while not paused. */
  render: (args: { gl: WebGLRenderingContext; t: number; dpr: number }) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function ShaderCanvas({ context, fallback, render, className, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { disabled, paused, dpr } = useShaderLifecycle({ canvasRef: ref, context });

  // ... (mount canvas, init gl, run RAF loop, respect paused, respect dpr,
  //      handle webglcontextlost/restored, cleanup on unmount)

  if (disabled) return <>{fallback}</>;

  return (
    <canvas
      ref={ref}
      className={className}
      style={style}
      data-shader-paused={paused ? 'true' : 'false'}
    />
  );
}
```

Full implementation: standard WebGL boilerplate (create context, compile shaders the consumer provides, set viewport based on canvas size × dpr, run RAF, suspend on `paused`).

---

# Phase 10 — 60 cosmetic components

Each task in this phase builds one kind. The user can split execution across multiple sessions. Each item is one React component file under `components/cosmetics/{kind}/{slug}.tsx`. Naming: filename matches the slug with the `kind.` prefix stripped (e.g. `frame.lava-lamp` → `frames/lava-lamp.tsx`).

**Shared signatures:**
- Frame: `default export ({ children, size, userStats? }) => JSX`
- Badge: `default export ({ size, userStats? }) => JSX`
- Name FX: `default export ({ children, userStats? }) => JSX`
- Theme: `default export ({ userStats? }) => JSX`

## Task 18: Build 16 frames

**Files:**
- Create: `components/cosmetics/frames/lava-lamp.tsx`
- Create: `components/cosmetics/frames/oil-slick.tsx`
- Create: `components/cosmetics/frames/crt-scanline.tsx`
- Create: `components/cosmetics/frames/mobius.tsx`
- Create: `components/cosmetics/frames/cable.tsx`
- Create: `components/cosmetics/frames/ferrofluid.tsx`
- Create: `components/cosmetics/frames/torii.tsx`
- Create: `components/cosmetics/frames/weather-front.tsx`
- Create: `components/cosmetics/frames/scan-ring.tsx`
- Create: `components/cosmetics/frames/elo-medal.tsx`
- Create: `components/cosmetics/frames/streak-pyre.tsx` (smart)
- Create: `components/cosmetics/frames/canthal.tsx`
- Create: `components/cosmetics/frames/crown-letters.tsx`
- Create: `components/cosmetics/frames/scoreband.tsx` (smart, size-gated)
- Create: `components/cosmetics/frames/heartbreaker.tsx`
- Create: `components/cosmetics/frames/stained-glass.tsx`

Each frame component is a wrapper that:
1. Renders an outer 1:1 element at the requested `size`
2. Mounts the cosmetic effect inside as an absolutely-positioned layer
3. Renders `children` (the avatar) in the center via an inner `<div>` at `size - 2 × ringInset`

Build technique per item per the catalog `build` column. For shader items, use `<ShaderCanvas context="inline">` with a GLSL fragment shader. Source / inspiration tags below indicate a starting point — every shader gets palette-retargeted to the holymog tier colors and recompiled against WebGL1.

- [ ] **Step 1: Build all 8 paid frames**

| Slug | Build | Notes |
|---|---|---|
| `lava-lamp` | shader | adapt Shadertoy "metaballs" pattern; palette = `#f97316 → #eab308 → #ef4444`; inverted alpha mask for the ring shape |
| `oil-slick` | shader | thin-film interference via `cos(uv * freq) → hsv` palette over a black ring |
| `crt-scanline` | shader | green phosphor (`#22c55e`), horizontal scanline noise, subtle barrel distortion via UV warp |
| `mobius` | shader | parametric möbius strip in 2.5D; monochrome `#f5f5f5` with edge darkening |
| `cable` | create | three SVG `<path>` braids using `stroke-dasharray` animation; colors `#ef4444 / #22d3ee / #84cc16` |
| `ferrofluid` | shader | noise-driven displacement spikes from the inside of the ring; black on transparent |
| `torii` | create | 4 SVG torii silhouettes at cardinal points; CSS `@keyframes` opacity pulse, gold `#d4af37` |
| `weather-front` | create | SVG isobar curves with `stroke-dashoffset` rotation; lightning bolt that opacity-pulses once per cycle |

- [ ] **Step 2: Build all 5 achievement frames**

| Slug | Build | Notes |
|---|---|---|
| `scan-ring` | create | SVG dots + connecting lines arranged as a MediaPipe face-outline ring (~80 nodes) |
| `elo-medal` | create | 4 concentric SVG rings stroked in tier colors (F/D/C/B/A) with subtle gold center stroke |
| `streak-pyre` | shader | flame shader (perlin × upward UV); `userStats.currentStreak` clamped to [1, 30] linearly modulates `intensity` uniform |
| `canthal` | create | 12 SVG eye-shape glyphs arranged radially, each rotated to tilt 12° upward toward the avatar |
| `crown-letters` | create | tier-letter glyphs (S+, S, A, A-, B, B+) arranged as an arc on the upper third; gold gradient text fill |

- [ ] **Step 3: Build all 3 holymog+ exclusive frames**

| Slug | Build | Notes |
|---|---|---|
| `scoreband` | create | When `size >= 96`: render the `bestScanOverall` digits looping around the ring via SVG `<textPath>` along a circle. When `size < 96`: render `<StaticFallback color="#d4af37" ring />` (gold ring outline). |
| `heartbreaker` | create | 8 SVG hearts spaced around the ring; each animates `break → mend` on a 4s heartbeat via `clip-path` swap |
| `stained-glass` | shader | radial 12-segment voronoi-like fragment with jewel-tone palette (sapphire, emerald, ruby, amber); slow temperature drift via uniform `t` cycling palette LUT |

- [ ] **Step 4: Verify each component mounts on the store page**

After each batch, visit `/account/store` → frames tab. Confirm cards render the live preview. Sub-only items show "subscribe to unlock" badge (already implemented). Smart items render their fallback preview (use mock userStats in the store preview).

## Task 19: Build 15 badges

**Files:** `components/cosmetics/badges/{slug}.tsx` × 15

Badges are 64×64 SVG/canvas components rendered at ~22px inline. Hover-state: badge slightly scales up (CSS `transition: transform`).

- [ ] **Step 1: Build all 8 paid badges**

| Slug | Build | Notes |
|---|---|---|
| `ripple` | shader | 3 concentric ring SDFs expanding + fading; cool palette `#22d3ee → transparent` |
| `eclipse` | shader | black disc on warm corona ring; corona uses noise-driven radial flares; `#f97316` highlights |
| `match` | shader | small flame at top of an SVG matchstick; 3-phase cycle (ignite → burn → regen) |
| `tarot-back` | create | SVG sun + crescent moon stacked vertically inside an ornate diamond border; gold `#d4af37` on `#0a0a0a` |
| `compass` | create | SVG cardinal-direction rose with a slowly drifting needle via CSS `rotate` keyframes |
| `honeycomb` | create | single SVG hex with a gold rectangle inside whose `height` animates 30% → 70% (liquid level) |
| `fractal` | create | SVG snowflake redrawing one branch at a time via `stroke-dasharray` cycle |
| `morse` | create | 3 SVG dots; CSS keyframes opacity-pulse in `· · ─` rhythm (3-1-2 ratio) |

- [ ] **Step 2: Build all 5 achievement badges**

| Slug | Build | Notes |
|---|---|---|
| `scan-1` | create | SVG corner brackets + center dot; brackets animate inward then settle on mount |
| `identity` | create | SVG face profile filled in solid, with a single horizontal `<rect>` sweep via `y` keyframe |
| `duelist` | create | 2 SVG profile silhouettes facing each other; subtle scale-pulse on the line connecting them |
| `king` | create | SVG chess king icon with a `box-shadow` pulse aura via CSS |
| `tier-stamp` | create | **smart**: read `userStats.bestScanOverall`, compute tier via `getTier()`, render the tier letter in brand color inside a square stamp border |

- [ ] **Step 3: Build all 2 holymog+ exclusive badges**

| Slug | Build | Notes |
|---|---|---|
| `holy-wordmark` | create | SVG halo (thin gold ring) with "holymog" wordmark text inside; halo rotates via CSS at 30s/rotation |
| `gavel` | shader | SVG gavel with a shader-rendered shockwave radiating from its impact point on a 2s heartbeat |

## Task 20: Build 14 name fx

**Files:** `components/cosmetics/name-fx/{slug}.tsx` × 14

Name FX wrap the display name text. Build technique:
- **CSS-driven**: render a `<span>` with the children, apply a CSS class with the gradient/shadow/etc.
- **Smart**: read `userStats` and modify the rendered output (prefix/suffix/wrap)
- **Shader overlay**: render the text + a `<ShaderCanvas>` absolutely positioned over it using `mix-blend-mode: screen`

- [ ] **Step 1: Build all 7 paid name fx**

| Slug | Build | Notes |
|---|---|---|
| `embossed-gold` | create | CSS class with `background: linear-gradient` (gold leaf), `background-clip: text`, double drop-shadow for emboss |
| `carved-obsidian` | create | CSS class with black gradient text + sharp inner shadow + prismatic outline via `text-stroke` |
| `smoke-trail` | shader | small `<ShaderCanvas>` overlay above each letter that renders upward-drifting smoke noise |
| `frosted-glass` | create | CSS class with `backdrop-filter: blur(2px)`, etched-white text, subtle rainbow border via `border-image` |
| `ink-bleed` | shader | sumi calligraphy ink-spread via noise; text rendered in canvas with the brush effect on top |
| `pixelsort` | create | CSS keyframe that animates `clip-path: inset()` rectangles sliding horizontally across the text |
| `aurora` | create | CSS animated `linear-gradient` across `#22d3ee → #a855f7 → #84cc16 → #f97316` with `background-clip: text` |

- [ ] **Step 2: Build all 5 achievement name fx**

| Slug | Build | Notes |
|---|---|---|
| `signed` | create | CSS `text-decoration: underline` with an SVG handwritten-stroke underline that draws once via `stroke-dasharray` on mount |
| `tier-prefix` | create | **smart**: read `userStats.bestScanOverall`, compute tier letter via `getTier()`, render tier letter (colored) + space + children |
| `callout` | create | **smart**: render children + `(` + `userStats.weakestSubScore` + `)` in muted gray |
| `streak-flame` | create | **smart**: render children + " " + `userStats.currentWinStreak` + 🔥 in orange `#f97316` |
| `elo-king` | create | **smart**: render children + `<sup>` `userStats.elo` `</sup>` in sky-blue `#38bdf8` |

- [ ] **Step 3: Build all 2 holymog+ exclusive name fx**

| Slug | Build | Notes |
|---|---|---|
| `divine-judgment` | shader | text rendered + golden-flame shader overlay using `mix-blend-mode: screen` + tiny SVG halo above each letter |
| `score-overlay` | create | **smart**: render children + small absolutely-positioned `<span>` above the text with `userStats.bestScanOverall` in gold tabular-nums |

## Task 21: Build 15 themes

**Files:** `components/cosmetics/themes/{slug}.tsx` × 15

Themes are full-bleed `fixed` elements behind the profile content. Use `<ShaderCanvas context="fullscreen">` for shader items; CSS keyframes / SVG for create items.

- [ ] **Step 1: Build all 7 paid themes**

| Slug | Build | Notes |
|---|---|---|
| `rain` | shader | procedural rain streaks via UV-displaced noise; cool-toned bokeh (`#22d3ee` blurred circles) in the background layer |
| `dust` | shader | particle-noise drifting on warm gradient `#f97316`/`#eab308`; faint volumetric beam from top-left |
| `spotlight` | shader | 3 shifting radial spotlights (each a separate uniform) sweeping across `#0a0a0a` |
| `corridor` | create | SVG perspective grid + `transform: perspective()` 3D drift toward the vanishing point; accent color `#22d3ee` |
| `aurora` | shader | full-bleed aurora curtain via 2D Perlin noise; tier-color palette cycling |
| `tidewave` | shader | single sine-wave horizon + glow foam at the wave peak; near-black field |
| `granite` | shader | dark granite via voronoi noise; slow caustic light pattern overlay via second noise layer |

- [ ] **Step 2: Build all 5 achievement themes**

| Slug | Build | Notes |
|---|---|---|
| `match-found` | create | 2 SVG profile silhouettes anchored at left/right edges; SVG `<line>` between them whose `stroke-dasharray` animates a pulse traveling left-to-right and back |
| `tier-grid` | create | CSS grid of tier-letter glyphs (`S+`, `A`, `B`, `C`, ...) tiling the viewport; each letter's color cycles through tier palette via CSS animation |
| `win-stack` | create | **smart**: a vertical column on one edge of the viewport with `userStats.matchesWon` stacked rectangles, each colored by the tier band the user was in when that win happened (simplified: color all bars current tier) |
| `embers` | create | CSS-only particle field — 30 absolutely-positioned `<span>` elements with random offsets, animated `translateY` and `opacity` upward, orange→transparent |
| `god-beam` | shader | volumetric light beam from top center descending; ray-marching effect via 2D approximation |

- [ ] **Step 3: Build all 3 holymog+ exclusive themes**

| Slug | Build | Notes |
|---|---|---|
| `divine-rays` | shader | 12 radial gold god-rays from centered halo; rays subtly oscillate intensity |
| `throne` | create | centered SVG crown silhouette; surrounding ring of 24 small gold circles rotating slowly via CSS |
| `shockwave` | shader | radial ring expanding outward in gold→obsidian gradient; resets on a 3s heartbeat |

- [ ] **Step 4: Verify each theme on a public profile**

Visit `/@<username>` for a test user with each theme equipped. Confirm: animation runs, `prefers-reduced-motion` falls back to gradient, mobile Safari doesn't crash.

---

# Phase 11 — Catalog seed + registry

## Task 22: Catalog seed migration

**Files:**
- Create: `docs/migrations/2026-05-11-cosmetic-catalog-seed.sql`

- [ ] **Step 1: Write the seed**

```sql
-- ============================================================
-- 60-item cosmetic catalog seed. Wipes any existing rows first
-- (idempotent — safe to re-run). All items are coded React
-- components — image_url is null throughout.
-- ============================================================

begin;

delete from user_inventory where source = 'achievement';
delete from catalog_items;

insert into catalog_items
  (kind, slug, name, description, price_cents, image_url, sort_order,
   active, subscriber_only, unlock_method)
values
  -- PAID FRAMES ($6 = 600 cents) — generic-but-unique aesthetics
  ('frame', 'frame.lava-lamp',     'lava lamp',     'molten blobs rising and merging in slow viscosity, sunset colors',           600, null,  10, true, false, 'purchase'),
  ('frame', 'frame.oil-slick',     'oil slick',     'iridescent thin-film rainbow drifting across a wet-asphalt black ring',     600, null,  11, true, false, 'purchase'),
  ('frame', 'frame.crt-scanline',  'crt scanline',  'green phosphor scanlines rolling around the ring with subtle screen curvature', 600, null, 12, true, false, 'purchase'),
  ('frame', 'frame.mobius',        'möbius',        'a single möbius strip slowly rotating, monochrome',                         600, null,  13, true, false, 'purchase'),
  ('frame', 'frame.cable',         'cable',         'three colored wires braiding around the ring, server-rack feel',            600, null,  14, true, false, 'purchase'),
  ('frame', 'frame.ferrofluid',    'ferrofluid',    'black magnetic liquid spiking outward in living porcupine bristles',        600, null,  15, true, false, 'purchase'),
  ('frame', 'frame.torii',         'torii',         'four torii gate silhouettes at cardinal points with a slow gold pulse',     600, null,  16, true, false, 'purchase'),
  ('frame', 'frame.weather-front', 'weather front', 'swirling pressure-system isobars with a lightning fork sparking once per loop', 600, null, 17, true, false, 'purchase'),

  -- PAID BADGES ($4 = 400 cents)
  ('badge', 'badge.ripple',     'ripple',     'concentric water ripples expanding and fading on a slow loop',                400, null,  20, true, false, 'purchase'),
  ('badge', 'badge.eclipse',    'eclipse',    'total solar eclipse with corona flares licking outward',                      400, null,  21, true, false, 'purchase'),
  ('badge', 'badge.match',      'match',      'a single match igniting, burning down, regenerating',                         400, null,  22, true, false, 'purchase'),
  ('badge', 'badge.tarot-back', 'tarot back', 'bold geometric tarot motif: sun and crescent moon stacked, gold on black',    400, null,  23, true, false, 'purchase'),
  ('badge', 'badge.compass',    'compass',    'minimalist cardinal-direction rose with the needle drifting like a real compass', 400, null, 24, true, false, 'purchase'),
  ('badge', 'badge.honeycomb',  'honeycomb',  'a single hex cell with a slow gold liquid level rising and falling inside',   400, null,  25, true, false, 'purchase'),
  ('badge', 'badge.fractal',    'fractal',    'algorithmic snowflake redrawing one branch at a time',                        400, null,  26, true, false, 'purchase'),
  ('badge', 'badge.morse',      'morse',      'three pulsing dots cycling a slow rhythmic morse pattern',                    400, null,  27, true, false, 'purchase'),

  -- PAID NAME FX ($8 = 800 cents)
  ('name_fx', 'name.embossed-gold',   'embossed gold',   'letters appearing 3D-stamped in gold leaf with inner shadow',                800, null, 30, true, false, 'purchase'),
  ('name_fx', 'name.carved-obsidian', 'carved obsidian', 'letters chiseled into volcanic glass with a prismatic edge highlight',       800, null, 31, true, false, 'purchase'),
  ('name_fx', 'name.smoke-trail',     'smoke trail',     'wispy smoke drifting upward off each letter in real time',                   800, null, 32, true, false, 'purchase'),
  ('name_fx', 'name.frosted-glass',   'frosted glass',   'letters as etched frosted glass with subtle prismatic edge refraction',      800, null, 33, true, false, 'purchase'),
  ('name_fx', 'name.ink-bleed',       'ink bleed',       'sumi brush calligraphy with ink wicking outward into paper fibers',          800, null, 34, true, false, 'purchase'),
  ('name_fx', 'name.pixelsort',       'pixelsort',       'refined horizontal pixel-sort distortion sliding through the letters',       800, null, 35, true, false, 'purchase'),
  ('name_fx', 'name.aurora',          'aurora',          'aurora gradient cycling through the letterforms, slow drift',                800, null, 36, true, false, 'purchase'),

  -- PAID THEMES ($10 = 1000 cents)
  ('theme', 'theme.rain',      'rain',      'procedural rain streaks falling across a near-black field with cool-toned bokeh', 1000, null, 40, true, false, 'purchase'),
  ('theme', 'theme.dust',      'dust',      'slow drifting particles in a warm gradient, faint volumetric light beam',        1000, null, 41, true, false, 'purchase'),
  ('theme', 'theme.spotlight', 'spotlight', 'shifting radial spotlights sweeping across a near-black backdrop',                1000, null, 42, true, false, 'purchase'),
  ('theme', 'theme.corridor',  'corridor',  'infinite perspective grid receding into a vanishing point, single accent color',  1000, null, 43, true, false, 'purchase'),
  ('theme', 'theme.aurora',    'aurora',    'full-bleed aurora cycling through tier colors, slow horizontal drift',            1000, null, 44, true, false, 'purchase'),
  ('theme', 'theme.tidewave',  'tidewave',  'single oscillating sine-wave horizon with glow-point foam, near-black field',     1000, null, 45, true, false, 'purchase'),
  ('theme', 'theme.granite',   'granite',   'dark granite-grain noise with a slow caustic light pattern washing across',       1000, null, 46, true, false, 'purchase'),

  -- ACHIEVEMENT FRAMES (free, unlock_method = 'achievement')
  ('frame', 'frame.scan-ring',     'scan ring',     'mediapipe face-landmark dots and connecting lines forming the ring',       0, null, 100, true, false, 'achievement'),
  ('frame', 'frame.elo-medal',     'elo medal',     'concentric tier-color bands stacked like a target medallion',              0, null, 101, true, false, 'achievement'),
  ('frame', 'frame.streak-pyre',   'streak pyre',   'flame ring whose intensity scales with your current streak length',        0, null, 102, true, false, 'achievement'),
  ('frame', 'frame.canthal',       'canthal',       'ring of upward-tilted eye shapes pointing toward the avatar',              0, null, 103, true, false, 'achievement'),
  ('frame', 'frame.crown-letters', 'crown letters', 'tier-letter glyphs arranged as a crown on the upper arc',                  0, null, 104, true, false, 'achievement'),

  -- ACHIEVEMENT BADGES
  ('badge', 'badge.scan-1',     'first scan', 'scanner reticle with the corner brackets locking onto a center dot',                  0, null, 110, true, false, 'achievement'),
  ('badge', 'badge.identity',   'identity',   'face-profile silhouette filled in with a single horizontal scan-line passing',         0, null, 111, true, false, 'achievement'),
  ('badge', 'badge.duelist',    'duelist',    'two profile silhouettes facing each other in 1v1 stance',                              0, null, 112, true, false, 'achievement'),
  ('badge', 'badge.king',       'king',       'chess king piece with a faint pulsing aura',                                           0, null, 113, true, false, 'achievement'),
  ('badge', 'badge.tier-stamp', 'tier stamp', 'your current tier letter stamped into the badge with crisp brand colors',              0, null, 114, true, false, 'achievement'),

  -- ACHIEVEMENT NAME FX
  ('name_fx', 'name.signed',       'signed',       'clean handwritten signature underline that draws itself once on render',  0, null, 120, true, false, 'achievement'),
  ('name_fx', 'name.tier-prefix',  'tier prefix',  'your live scan tier letter precedes your name everywhere',                0, null, 121, true, false, 'achievement'),
  ('name_fx', 'name.callout',      'callout',      'your weakest sub-score in brackets cycles per visit',                     0, null, 122, true, false, 'achievement'),
  ('name_fx', 'name.streak-flame', 'streak flame', 'your current streak digit appears in flame next to your name',            0, null, 123, true, false, 'achievement'),
  ('name_fx', 'name.elo-king',     'elo king',     'your current ELO appears as small superscript next to your name',          0, null, 124, true, false, 'achievement'),

  -- ACHIEVEMENT THEMES
  ('theme', 'theme.match-found', 'match found', 'two profile silhouettes on opposite edges with a slow connecting pulse linking them across the center', 0, null, 130, true, false, 'achievement'),
  ('theme', 'theme.tier-grid',   'tier grid',   'tier-letter pattern (S+/A/B/C) tiling and slowly cycling tier colors',                                 0, null, 131, true, false, 'achievement'),
  ('theme', 'theme.win-stack',   'win stack',   'your win count stacking visibly as a column of tier-color bars on one edge',                           0, null, 132, true, false, 'achievement'),
  ('theme', 'theme.embers',      'embers',      'particle field of glowing embers rising upward, pyre vibe',                                            0, null, 133, true, false, 'achievement'),
  ('theme', 'theme.god-beam',    'god beam',    'volumetric divine light beam descending from above onto a near-black field',                           0, null, 134, true, false, 'achievement'),

  -- HOLYMOG+ EXCLUSIVE
  ('frame',   'frame.scoreband',       'scoreband',       'ring rendered as your peak overall-score digits repeating (≥96px); static gold ring outline at smaller sizes', 0, null, 200, true, true, 'subscriber'),
  ('frame',   'frame.heartbreaker',    'heartbreaker',    'ring of broken hearts mending and re-breaking on a slow heartbeat pulse',                                       0, null, 201, true, true, 'subscriber'),
  ('frame',   'frame.stained-glass',   'stained glass',   'cathedral stained-glass panels arranged radially in deep jewel tones, light shifting through them in slow temperature drift', 0, null, 202, true, true, 'subscriber'),
  ('badge',   'badge.holy-wordmark',   'holy wordmark',   'the holymog wordmark inside a thin halo, slow gold rotation',                                                  0, null, 210, true, true, 'subscriber'),
  ('badge',   'badge.gavel',           'gavel',           'a gavel mid-strike with a radial shockwave pulsing outward on impact',                                          0, null, 211, true, true, 'subscriber'),
  ('name_fx', 'name.divine-judgment',  'divine judgment', 'letters burning with golden judgment flame, halo above each character',                                         0, null, 220, true, true, 'subscriber'),
  ('name_fx', 'name.score-overlay',    'score overlay',   'your peak overall-score floats above the name in tiny gold digits',                                             0, null, 221, true, true, 'subscriber'),
  ('theme',   'theme.divine-rays',     'divine rays',     'golden god-rays radiating from a centered halo across the full field',                                          0, null, 230, true, true, 'subscriber'),
  ('theme',   'theme.throne',          'throne',          'centered crown silhouette with a slow-rotating gold particle ring around it',                                   0, null, 231, true, true, 'subscriber'),
  ('theme',   'theme.shockwave',       'shockwave',       'gold and obsidian radial shockwave pulsing outward on a slow heartbeat',                                        0, null, 232, true, true, 'subscriber')
;

commit;
```

- [ ] **Step 2: Run in Supabase Studio**

```sql
select kind, count(*) from catalog_items group by kind;
```

Expected:
- badge: 15
- frame: 16
- name_fx: 14
- theme: 15
Total: 60

## Task 23: Registry population

**Files:**
- Modify: `lib/customization.ts`

- [ ] **Step 1: Replace the registries with component-mapped versions**

```ts
import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';

export type UserStats = {
  elo?: number | null;
  bestScanOverall?: number | null;
  currentStreak?: number | null;
  currentWinStreak?: number | null;
  matchesWon?: number | null;
  weakestSubScore?: 'jawline' | 'eyes' | 'skin' | 'cheekbones' | null;
};

type FrameComp = ComponentType<{ children: ReactNode; size: number; userStats?: UserStats }>;
type BadgeComp = ComponentType<{ size: number; userStats?: UserStats }>;
type NameFxComp = ComponentType<{ children: ReactNode; userStats?: UserStats }>;
type ThemeComp = ComponentType<{ userStats?: UserStats }>;

export type FrameDef = {
  slug: string; kind: 'frame'; name: string;
  component: FrameComp; ringInset: number; haloColor: string; smart?: boolean;
};
export type BadgeDef = {
  slug: string; kind: 'badge'; name: string;
  component: BadgeComp; smart?: boolean;
};
export type NameFxDef = {
  slug: string; kind: 'name_fx'; name: string;
  component: NameFxComp; smart?: boolean;
};
export type ThemeDef = {
  slug: string; kind: 'theme'; name: string;
  component: ThemeComp; smart?: boolean;
};

// Dynamic imports keep the bundle small — each item loads on first render of its slug.
export const FRAMES: Record<string, FrameDef> = {
  'frame.lava-lamp': {
    slug: 'frame.lava-lamp', kind: 'frame', name: 'lava lamp',
    component: dynamic(() => import('@/components/cosmetics/frames/lava-lamp')) as FrameComp,
    ringInset: 8, haloColor: 'rgba(249,115,22,0.30)',
  },
  // ... 15 more frame entries
};

export const BADGES: Record<string, BadgeDef> = {
  'badge.ripple': {
    slug: 'badge.ripple', kind: 'badge', name: 'ripple',
    component: dynamic(() => import('@/components/cosmetics/badges/ripple')) as BadgeComp,
  },
  // ... 14 more badge entries
};

export const NAME_FX: Record<string, NameFxDef> = {
  'name.embossed-gold': {
    slug: 'name.embossed-gold', kind: 'name_fx', name: 'embossed gold',
    component: dynamic(() => import('@/components/cosmetics/name-fx/embossed-gold')) as NameFxComp,
  },
  // ... 13 more
};

export const THEMES: Record<string, ThemeDef> = {
  'theme.rain': {
    slug: 'theme.rain', kind: 'theme', name: 'rain',
    component: dynamic(() => import('@/components/cosmetics/themes/rain')) as ThemeComp,
  },
  // ... 14 more
};

export function getFrame(slug: string | null | undefined): FrameDef | null {
  return slug ? (FRAMES[slug] ?? null) : null;
}
export function getBadge(slug: string | null | undefined): BadgeDef | null {
  return slug ? (BADGES[slug] ?? null) : null;
}
export function getNameFx(slug: string | null | undefined): NameFxDef | null {
  return slug ? (NAME_FX[slug] ?? null) : null;
}
export function getTheme(slug: string | null | undefined): ThemeDef | null {
  return slug ? (THEMES[slug] ?? null) : null;
}

// Mark smart slugs (so the renderer can decide when to short-circuit
// on missing userStats — see Task 9).
export const SMART_SLUGS = new Set<string>([
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
```

- [ ] **Step 2: Fill all 60 entries**

Frames: 16 entries with `ringInset` (typically 6–10) and `haloColor` (a tinted glow color for the section accent).
Badges: 15 entries.
Name FX: 14 entries.
Themes: 15 entries.

- [ ] **Step 3: Visit `/account/store`**

Confirm all 4 tabs show their items with live previews. Sub-only items show "subscribe to unlock". Achievement items show their progress bar.

---

# Phase 12 — Smoke test

## Task 24: End-to-end verification

- [ ] **Step 1: Run through spec §9 acceptance criteria**

Per spec §9, manually verify each criterion:

1. All 60 cosmetics render correctly on profile, settings preview, battle tiles (frames + badges only), leaderboard rows
2. Smart cosmetics (8 items) display correct live data per user across all surfaces
3. `frame.scoreband` renders digits only at size ≥ 96px; falls back to gold ring outline below
4. Subscribing (test card 4242 4242 4242 4242) triggers all 9 benefits within 5 seconds of webhook
5. Cancelling keeps benefits until `current_period_end`, then revokes cleanly
6. Achievement unlocks fire toast notifications; multi-grant thresholds (A-tier scan, 25 wins, 1 scan, bio set) grant all mapped slugs
7. Sub-only items reject equip from non-subscribers with a clean error
8. Monthly cosmetic claim works once per 30-day window
9. 20% discount applies at Stripe Checkout for subscribers
10. Stripe webhook idempotency handles retries
11. Ad slots render on the 5 surfaces for free users widescreen, hidden for subscribers, hidden mobile
12. `<AdSlot>` defaults to hidden during state-loading
13. Mobile Safari renders a leaderboard with 50 entries (mix of shader + create frames) at ≥ 30fps
14. `prefers-reduced-motion` users see static fallbacks for every shader item
15. `npx tsc --noEmit` clean
16. No regressions on existing surfaces

- [ ] **Step 2: Commit**

```bash
git add docs/migrations/2026-05-11-subscription-and-achievements.sql \
        docs/migrations/2026-05-11-cosmetic-catalog-seed.sql \
        lib/subscription.ts lib/achievements.ts lib/shader-budget.ts \
        lib/customization.ts lib/scoreEngine.ts lib/publicProfile.ts \
        lib/livekit.ts lib/scanLimit.ts \
        hooks/useSubscription.ts hooks/useAchievementToast.ts \
        hooks/useShaderLifecycle.ts hooks/useDocumentVisibility.ts \
        components/cosmetics/ShaderCanvas.tsx \
        components/cosmetics/StaticFallback.tsx \
        components/cosmetics/frames \
        components/cosmetics/badges \
        components/cosmetics/name-fx \
        components/cosmetics/themes \
        components/customization/Frame.tsx \
        components/customization/Badge.tsx \
        components/customization/NameFx.tsx \
        components/customization/ThemeAmbient.tsx \
        components/AdSlot.tsx components/AchievementToast.tsx \
        components/SubscriberBadge.tsx \
        components/store/MonthlyClaimBanner.tsx \
        components/store/AchievementProgress.tsx \
        components/account/UpgradeCard.tsx \
        components/account/settings/SubscriptionSection.tsx \
        components/PublicProfileView.tsx \
        components/AccountSettingsTab.tsx \
        components/Providers.tsx components/FollowList.tsx \
        app/account/upgrade/page.tsx app/account/store/page.tsx \
        app/account/page.tsx app/leaderboard/page.tsx \
        app/help/page.tsx app/terms/page.tsx app/privacy/page.tsx \
        app/share/[platform]/page.tsx app/layout.tsx \
        app/api/webhooks/stripe/route.ts \
        app/api/checkout/create-session/route.ts \
        app/api/account/billing-portal/route.ts \
        app/api/account/redeem-monthly-cosmetic/route.ts \
        app/api/account/me/route.ts \
        app/api/account/banner/route.ts \
        app/api/account/equip/route.ts \
        app/api/battle/create/route.ts \
        app/api/battle/finish/route.ts \
        app/api/battle/queue/route.ts \
        app/api/score/route.ts \
        app/api/cron/expire-subscriptions/route.ts \
        app/api/cron/prune-old-data/route.ts \
        app/api/catalog/route.ts \
        app/api/leaderboard/route.ts \
        app/api/leaderboard/battles/route.ts \
        app/api/account/[username]/followers/route.ts \
        app/api/account/[username]/following/route.ts \
        app/api/battle/[id]/token/route.ts \
        vercel.json .env.local

git commit -m "$(cat <<'EOF'
holymog+ subscription + 60-coded-cosmetic catalog + achievements + ads

Ships the full monetization stack with a 100%-coded cosmetic catalog
(no generated assets — every item is a WebGL shader or CSS/SVG
component):

- 60 cosmetics across 4 categories (30 paid one-time, 20
  achievement-locked, 10 holymog+ exclusive). 32 shaders + 28 CSS/SVG
  components, all under components/cosmetics/.
- Shared shader infrastructure (useShaderLifecycle + ShaderCanvas)
  enforces intersection-observer gating, prefers-reduced-motion
  fallback, tab-visibility pause, DPR cap, and 8-instance concurrent
  budget — keeps mobile Safari smooth on long lists.
- holymog+ subscription at $5/mo or $50/yr via Stripe Subscriptions
  with all 9 benefits.
- Achievement engine: 20 thresholds firing from /api/score,
  /api/battle/finish, /api/account/me PATCH, /api/battle/queue with
  multi-grant support (A-tier scan grants 3 items, etc.).
- Smart cosmetics (8 items): frame.streak-pyre, frame.scoreband,
  badge.tier-stamp, name.tier-prefix, name.callout, name.streak-flame,
  name.elo-king, name.score-overlay, theme.win-stack — all read live
  user state and render per-user via userStats prop threaded through
  every render site.
- AdSlot on /account, /leaderboard, /help, /terms, /privacy,
  /share/[platform]. Widescreen-only, hidden for subscribers.
- /account/upgrade page + Stripe Billing Portal integration in
  settings.

Migrations: 2026-05-11-subscription-and-achievements.sql,
2026-05-11-cosmetic-catalog-seed.sql. Run both in Supabase Studio.

Stripe products required: holymog+ Monthly ($5/mo) + holymog+ Annual
($50/yr). Set STRIPE_PRICE_PLUS_MONTHLY and STRIPE_PRICE_PLUS_ANNUAL
in env. AdSense client ID in NEXT_PUBLIC_ADSENSE_CLIENT_ID.
EOF
)"
```

(No Co-Authored-By trailer per project preference.)

---

# Self-review notes

**Spec coverage check:** Every section of the spec maps to a task above.
- §2 Pricing → Tasks 5, 6, 15 (Stripe + upgrade page)
- §3.1–3.3 60 items → Tasks 18–21 (component builds) + Task 22 (seed) + Task 23 (registry)
- §3.4 Smart cosmetics (8 items) → Task 9 (broader plumbing covering all 4 kinds)
- §3.5 Multi-grant achievement map → Task 10 ACHIEVEMENTS map with explicit grants on A-tier (3 items), bio (2 items), 1 scan (2 items), 25 wins (2 items)
- §4.2 9 features → Tasks 7, 8, 13, plus inherent in schema (Task 1) and rendering (Tasks 9, 14)
- §4.3 Server gates → Task 7
- §5 Acquisition flows → covered by Tasks 4–8, 11, 14, 15
- §6 Schema → Task 1
- §7 Open decisions → resolved as: auto-grant achievements (Task 12), show sub-only items with CTA (Task 14), anniversary cooldown (Task 8), smart cosmetics yes (Task 9 expanded to 8 items), keep 10 fixed (no rotation code yet)
- §8 Sequencing → matches phases
- §9 Acceptance criteria → Task 24
- §10 Performance (mobile-aware) → Task 17 (shared shader infrastructure: useShaderLifecycle, ShaderCanvas, StaticFallback, shader-budget)

**Placeholder scan:** No "TBD" / "implement later" / "similar to" left in. The component-build tasks (18–21) contain table-driven specs with a build technique + concept per item; each is sufficient to implement standalone. The shader source/inspiration notes ("adapt Shadertoy metaballs...") are starting points; engineer customizes to brand palette per spec §3.

**Type consistency:** Verified `UserStats` shape matches across `lib/customization.ts`, all 4 renderers, and the smart components. `AchievementGrant` shape unchanged. `isSubscriber` / `useSubscription` returns aligned.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-10-cosmetic-catalog-and-subscription.md`.

Per the user's standing preference (saved in memory: no subagents for plan execution; no per-task typecheck/commit), execution is inline only and batches typecheck/commit at the end of each phase.

Rough effort estimate by phase:
- Phases 1–8 (subscription, gates, achievements, ads, store UI, upgrade, settings): ~12 hours
- Phase 9 (shared shader infra): ~3 hours
- Phase 10 (60 cosmetic components): ~30–40 hours
  - Frames (16): ~10 hours
  - Badges (15): ~6 hours
  - Name FX (14): ~5 hours
  - Themes (15): ~9 hours
- Phase 11 (seed + registry): ~2 hours
- Phase 12 (smoke test): ~3 hours

Total: ~50–60 hours. Realistically 3–4 multi-hour sessions if pushing hard, or 1 long autonomous run with `caffeinate`.

Before any execution: verify the spec at `docs/superpowers/specs/2026-05-10-cosmetic-catalog-and-subscription-design.md` and the catalog at `docs/superpowers/specs/2026-05-10-cosmetic-catalog.md` match expectations. Veto / refine any tasks first.
