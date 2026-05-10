import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { appUrlFor, getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/billing-portal
 *
 * Returns a Stripe Billing Portal session URL for the caller. The
 * portal lets users update card, view invoices, change plan, and
 * cancel — Stripe's hosted UI handles every edge case (proration,
 * refunds, dunning) so we don't need to ship our own.
 */
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

  // Fetch the subscription so we can hand the customer id to the portal.
  let customerId: string;
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  } catch {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: appUrlFor('/account?tab=settings'),
  });

  return NextResponse.json({ url: portal.url });
}
