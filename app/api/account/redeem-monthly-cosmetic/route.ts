import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isSubscriber } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * POST /api/account/redeem-monthly-cosmetic { slug }
 *
 * Active holymog+ subscribers can claim one free frame or badge per
 * subscription month. Rejects when:
 *   - caller is not a subscriber
 *   - cooldown is active (last claim < 30 days ago)
 *   - slug is not a frame or badge (themes + name fx are excluded)
 *   - slug is subscriber-only (already free for subscribers; no double-grant)
 *   - user already owns the item
 *
 * Atomic INSERT + UPDATE in a single transaction so a crash mid-redeem
 * can't grant the item without stamping the cooldown.
 */
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
    body = (await request.json()) as { slug?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.slug !== 'string') {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  const slug = body.slug;

  const pool = getPool();
  const item = await pool.query<{ kind: string; subscriber_only: boolean }>(
    `select kind, coalesce(subscriber_only, false) as subscriber_only
       from catalog_items where slug = $1 and active = true limit 1`,
    [slug],
  );
  if (item.rows.length === 0) {
    return NextResponse.json({ error: 'unknown_slug' }, { status: 404 });
  }
  const row = item.rows[0];
  if (row.kind !== 'frame' && row.kind !== 'badge') {
    return NextResponse.json(
      {
        error: 'wrong_kind',
        message: 'monthly credit covers frames and badges only',
      },
      { status: 400 },
    );
  }
  if (row.subscriber_only) {
    return NextResponse.json(
      {
        error: 'already_included',
        message: 'subscriber-only items are already free for you',
      },
      { status: 400 },
    );
  }

  // Check claim cooldown.
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

  // Check ownership.
  const owns = await pool.query(
    `select id from user_inventory where user_id = $1 and item_slug = $2 limit 1`,
    [user.id, slug],
  );
  if (owns.rows.length > 0) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  // Grant + stamp the claim atomically.
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
