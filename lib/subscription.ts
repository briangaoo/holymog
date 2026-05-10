import { getPool } from '@/lib/db';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * Server-side check: is the user currently a paying subscriber?
 *
 * Used by every benefit gate (unlimited scans, sub-only equip, 20%
 * checkout discount, 20-person private parties, etc). Returns false
 * for null/missing user. Treats 'past_due' as NOT subscribed — the
 * subscription is grace-period-ending and the user shouldn't get
 * benefits while their card is broken.
 */
export async function isSubscriber(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const pool = getPool();
  const result = await pool.query<{ status: string | null }>(
    `select subscription_status as status from profiles where user_id = $1 limit 1`,
    [userId],
  );
  const status = result.rows[0]?.status;
  return status !== null && status !== undefined && ACTIVE_STATUSES.has(status);
}

/**
 * Apply the 20% holymog+ discount to a price in cents. Used at Stripe
 * Checkout Session creation when the caller is a subscriber. Floored
 * (favours the merchant on fractional cents).
 */
export function applySubscriberDiscount(cents: number): number {
  return Math.floor(cents * 0.8);
}
