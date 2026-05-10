import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { appUrlFor, getStripe, isStripeConfigured } from '@/lib/stripe';
import { applySubscriberDiscount, isSubscriber } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ITEMS = 10;

type CosmeticBody = { items: string[] };
type SubscriptionBody = { subscription: 'monthly' | 'annual' };
type Body = CosmeticBody | SubscriptionBody;

type SessionUser = { id: string; email: string };

/**
 * POST /api/checkout/create-session
 *
 * Body is one of:
 *   1. `{ items: [slug, ...] }` — cosmetic purchases (one-time payment).
 *      Subscribers receive the 20% holymog+ discount on each line item.
 *   2. `{ subscription: 'monthly' | 'annual' }` — holymog+ subscription
 *      (recurring). Price IDs come from STRIPE_PRICE_PLUS_{MONTHLY,ANNUAL}.
 *
 * Returns `{ url, session_id }`. Catalog-purchase grants happen via the
 * Stripe webhook (`checkout.session.completed`); subscription state
 * activates via `customer.subscription.created`.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json({ error: 'no_email' }, { status: 400 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'checkout_unavailable', message: 'payments not configured' },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'checkout_unavailable' }, { status: 503 });
  }

  if ('subscription' in body) {
    return createSubscriptionSession(body.subscription, { id: user.id, email: user.email }, stripe);
  }
  if ('items' in body && Array.isArray(body.items)) {
    return createCosmeticSession(body.items, { id: user.id, email: user.email }, stripe);
  }
  return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
}

/* ----------------- holymog+ subscription Checkout Session ---------------- */

async function createSubscriptionSession(
  plan: 'monthly' | 'annual',
  user: SessionUser,
  stripe: Stripe,
): Promise<NextResponse> {
  if (plan !== 'monthly' && plan !== 'annual') {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }
  const priceId =
    plan === 'annual'
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
    // Subscription-data metadata propagates to customer.subscription.created
    // so the webhook can resolve user_id without a DB lookup.
    subscription_data: {
      metadata: { user_id: user.id, plan },
    },
  });

  if (!session_.url) {
    return NextResponse.json(
      { error: 'session_no_url', message: 'Stripe did not return a checkout URL.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: session_.url, session_id: session_.id });
}

/* --------------------- Cosmetic one-time Checkout Session ---------------- */

async function createCosmeticSession(
  rawItems: unknown[],
  user: SessionUser,
  stripe: Stripe,
): Promise<NextResponse> {
  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'no_items' }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: 'too_many_items' }, { status: 400 });
  }
  const slugs = rawItems.filter((s): s is string => typeof s === 'string');
  if (slugs.length === 0) {
    return NextResponse.json({ error: 'invalid_items' }, { status: 400 });
  }

  const pool = getPool();
  const items = await pool.query<{
    slug: string;
    name: string;
    description: string | null;
    price_cents: number;
    subscriber_only: boolean;
  }>(
    `select slug, name, description, price_cents,
            coalesce(subscriber_only, false) as subscriber_only
       from catalog_items
      where slug = any($1::text[])
        and active = true
        and price_cents > 0`,
    [slugs],
  );

  if (items.rows.length !== slugs.length) {
    return NextResponse.json(
      { error: 'invalid_items', message: 'some items are unavailable' },
      { status: 400 },
    );
  }

  // Sub-only items are never sold via cosmetic checkout — they're free
  // to active subscribers and unequippable for everyone else.
  if (items.rows.some((i) => i.subscriber_only)) {
    return NextResponse.json(
      {
        error: 'subscriber_only_item',
        message: 'these items are included with holymog+ and cannot be purchased individually',
      },
      { status: 400 },
    );
  }

  // Filter out items the user already owns — Stripe rejects "buy
  // something you already have" with a confusing error; better to
  // refuse cleanly here.
  const owned = await pool.query<{ item_slug: string }>(
    `select item_slug from user_inventory where user_id = $1 and item_slug = any($2::text[])`,
    [user.id, slugs],
  );
  if (owned.rows.length > 0) {
    return NextResponse.json(
      {
        error: 'already_owned',
        message: 'You already own one or more of these items.',
        items: owned.rows.map((r) => r.item_slug),
      },
      { status: 409 },
    );
  }

  // Apply the 20% subscriber discount at line-item creation. We compute
  // server-side from the user's profile — never trust client claims.
  const subscriber = await isSubscriber(user.id);

  const session_ = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    payment_method_types: ['card'],
    success_url: appUrlFor('/account/store/success?session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: appUrlFor('/account/store/cancel'),
    metadata: {
      user_id: user.id,
      slugs: items.rows.map((i) => i.slug).join(','),
    },
    line_items: items.rows.map((item) => ({
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
    })),
  });

  if (!session_.url) {
    return NextResponse.json(
      { error: 'session_no_url', message: 'Stripe did not return a checkout URL.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: session_.url, session_id: session_.id });
}
