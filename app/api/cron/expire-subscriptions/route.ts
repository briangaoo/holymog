import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyCronAuth } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/expire-subscriptions
 *
 * Daily cron: flips canceled / past_due subscriptions to null status
 * once their current_period_end has passed. Also unequips any
 * subscriber-only cosmetics from users whose subscriptions just expired
 * (clearing equipped_frame, equipped_theme, equipped_flair,
 * equipped_name_fx if they point at subscriber_only items).
 *
 * Idempotent; safe to re-run within the same day.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pool = getPool();

  const expired = await pool.query<{ user_id: string }>(
    `select user_id from profiles
      where subscription_status in ('canceled', 'past_due')
        and subscription_current_period_end is not null
        and subscription_current_period_end < now()`,
  );

  for (const row of expired.rows) {
    // Atomic: unequip every slot pointing at a subscriber_only item AND
    // null out subscription_status in one update. The CASE WHEN avoids
    // touching slots that aren't sub-only.
    await pool.query(
      `update profiles set
         equipped_frame    = case when equipped_frame in
             (select slug from catalog_items where coalesce(subscriber_only, false))
             then null else equipped_frame end,
         equipped_flair    = case when equipped_flair in
             (select slug from catalog_items where coalesce(subscriber_only, false))
             then null else equipped_flair end,
         equipped_theme    = case when equipped_theme in
             (select slug from catalog_items where coalesce(subscriber_only, false))
             then null else equipped_theme end,
         equipped_name_fx  = case when equipped_name_fx in
             (select slug from catalog_items where coalesce(subscriber_only, false))
             then null else equipped_name_fx end,
         subscription_status = null
       where user_id = $1`,
      [row.user_id],
    );
  }

  return NextResponse.json({ expired: expired.rows.length });
}
