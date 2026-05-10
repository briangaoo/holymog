import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import type { Pool } from 'pg';
import { getPool } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

/**
 * Resolve the user_id for a given Stripe Subscription. Two paths:
 *   1. The subscription was created via our /api/checkout/create-session
 *      with subscription_data.metadata.user_id set — preferred path.
 *   2. The subscription was previously associated with a profile (we
 *      stamped stripe_subscription_id) — fallback for events fired
 *      from the Billing Portal where metadata may not echo through.
 */
async function resolveSubscriptionUserId(
  pool: Pool,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const metaUserId = sub.metadata?.user_id;
  if (typeof metaUserId === 'string' && metaUserId.length > 0) {
    return metaUserId;
  }
  const result = await pool.query<{ user_id: string }>(
    `select user_id from profiles where stripe_subscription_id = $1 limit 1`,
    [sub.id],
  );
  return result.rows[0]?.user_id ?? null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook endpoint. Verifies the signature with
 * STRIPE_WEBHOOK_SECRET (rotate per environment) and processes events.
 *
 * Idempotency: stripe_purchases.stripe_session_id has UNIQUE; if a
 * retry hits us with the same session_id we no-op the insert. Inventory
 * rows are similarly UNIQUE on (user_id, item_slug) so granting the
 * same item twice is a noop.
 *
 * Events handled:
 *   - checkout.session.completed → record purchase + grant items
 *   - charge.refunded → mark purchase refunded (we don't reverse the
 *     inventory — admins can manually revoke if needed)
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: 'webhook_unconfigured' },
      { status: 503 },
    );
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  // Stripe requires the raw body for signature verification.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const pool = getPool();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Subscription checkout: customer.subscription.created fires separately
      // with the real subscription data — we just ack here.
      if (session.mode === 'subscription') {
        return NextResponse.json({ received: true, type: 'subscription_ack' });
      }
      const userId = session.metadata?.user_id;
      const slugsCsv = session.metadata?.slugs;
      if (!userId || !slugsCsv) {
        return NextResponse.json(
          { error: 'missing_metadata' },
          { status: 400 },
        );
      }
      const slugs = slugsCsv.split(',').filter(Boolean);
      const paymentIntent =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      const amountCents = session.amount_total ?? 0;
      const status = session.payment_status ?? 'unknown';

      // 1. Record the purchase. ON CONFLICT on session_id makes retries safe.
      await pool.query(
        `insert into stripe_purchases
           (user_id, stripe_session_id, stripe_payment_intent, amount_cents, status, items_jsonb)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         on conflict (stripe_session_id) do nothing`,
        [
          userId,
          session.id,
          paymentIntent,
          amountCents,
          status,
          JSON.stringify(slugs.map((slug: string) => ({ slug }))),
        ],
      );

      // 2. Grant inventory rows. ON CONFLICT (user_id, item_slug) means
      // re-deliveries don't double-grant.
      for (const slug of slugs) {
        await pool.query(
          `insert into user_inventory (user_id, item_slug, source, stripe_payment_intent)
             values ($1, $2, 'purchase', $3)
             on conflict (user_id, item_slug) do nothing`,
          [userId, slug, paymentIntent],
        );
      }

      // 3. Audit log for traceability.
      await pool
        .query(
          `insert into audit_log (user_id, action, resource, metadata)
             values ($1, 'purchase_completed', $2, $3::jsonb)`,
          [
            userId,
            session.id,
            JSON.stringify({
              slugs,
              amount_cents: amountCents,
              payment_intent: paymentIntent,
            }),
          ],
        )
        .catch(() => {});

      return NextResponse.json({ received: true });
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (paymentIntent) {
        await pool.query(
          `update stripe_purchases set status = 'refunded' where stripe_payment_intent = $1`,
          [paymentIntent],
        );
        await pool
          .query(
            `insert into audit_log (action, resource, metadata)
               values ('purchase_refunded', $1, $2::jsonb)`,
            [
              paymentIntent,
              JSON.stringify({ amount_refunded: charge.amount_refunded }),
            ],
          )
          .catch(() => {});
      }
      return NextResponse.json({ received: true });
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveSubscriptionUserId(pool, sub);
      if (!userId) {
        // Subscription not associated with any holymog user (shouldn't
        // happen — we always set metadata on Checkout). Ack to stop retries.
        return NextResponse.json({ received: true, warning: 'unknown_user' });
      }
      const periodEnd = new Date(sub.current_period_end * 1000);
      const startedAt = new Date(sub.created * 1000);
      await pool.query(
        `update profiles set
           subscription_status = $1,
           subscription_tier = 'plus',
           subscription_started_at = coalesce(subscription_started_at, $2),
           subscription_current_period_end = $3,
           stripe_subscription_id = $4
         where user_id = $5`,
        [sub.status, startedAt, periodEnd, sub.id, userId],
      );
      await pool
        .query(
          `insert into audit_log (user_id, action, resource, metadata)
             values ($1, 'subscription_updated', $2, $3::jsonb)`,
          [
            userId,
            sub.id,
            JSON.stringify({
              status: sub.status,
              period_end: sub.current_period_end,
              event_type: event.type,
            }),
          ],
        )
        .catch(() => {});
      return NextResponse.json({ received: true });
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveSubscriptionUserId(pool, sub);
      if (!userId) {
        return NextResponse.json({ received: true, warning: 'unknown_user' });
      }
      // Mark canceled but keep benefits until current_period_end (Stripe's
      // standard cancellation semantics). The expire-subscriptions cron
      // flips status to null after the period elapses.
      await pool.query(
        `update profiles set subscription_status = 'canceled' where user_id = $1`,
        [userId],
      );
      await pool
        .query(
          `insert into audit_log (user_id, action, resource, metadata)
             values ($1, 'subscription_canceled', $2, $3::jsonb)`,
          [userId, sub.id, JSON.stringify({ period_end: sub.current_period_end })],
        )
        .catch(() => {});
      return NextResponse.json({ received: true });
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        typeof invoice.subscription === 'string'
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

    default:
      // Acknowledge other events without action — Stripe will keep
      // sending them but we don't need to handle every event type.
      return NextResponse.json({ received: true, ignored: event.type });
  }
}
