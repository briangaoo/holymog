import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isValidItemSlug } from '@/lib/customization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/grant { user_id?, username?, slug, source? }
 *
 * Admin-only utility that grants a catalog item to a user without a
 * Stripe payment. Used for early-access founders, contest prizes,
 * customer-service refunds, and seeding test accounts.
 *
 * Auth model: caller must be in `ADMIN_USER_IDS` (comma-separated env
 * var). We don't trust client-supplied user identities — caller proves
 * admin via session, payload identifies recipient.
 *
 * Source defaults to 'grant'. Stripe-completed purchases use the
 * webhook path with source='purchase' instead.
 */
export async function POST(request: Request) {
  const session = await auth();
  const caller = session?.user;
  if (!caller) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!adminIds.includes(caller.id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { user_id?: unknown; username?: unknown; slug?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.slug !== 'string' || !isValidItemSlug(body.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  const source =
    typeof body.source === 'string' &&
    ['grant', 'reward', 'purchase'].includes(body.source)
      ? body.source
      : 'grant';

  const pool = getPool();

  // Resolve user_id from either user_id or username.
  let userId: string | null = null;
  if (typeof body.user_id === 'string' && body.user_id.length > 0) {
    userId = body.user_id;
  } else if (typeof body.username === 'string' && body.username.length > 0) {
    const lookup = await pool.query<{ user_id: string }>(
      `select user_id from profiles where display_name = $1 limit 1`,
      [body.username.toLowerCase()],
    );
    userId = lookup.rows[0]?.user_id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  // ON CONFLICT (user_id, item_slug) DO NOTHING — idempotent grants.
  const result = await pool.query(
    `insert into user_inventory (user_id, item_slug, source)
       values ($1, $2, $3)
       on conflict (user_id, item_slug) do nothing
       returning id`,
    [userId, body.slug, source],
  );

  // Audit-log every grant for traceability.
  await pool
    .query(
      `insert into audit_log (user_id, action, resource, metadata)
         values ($1, 'item_granted', $2, $3::jsonb)`,
      [
        userId,
        body.slug,
        JSON.stringify({ source, by_admin: caller.id }),
      ],
    )
    .catch(() => {});

  return NextResponse.json({
    ok: true,
    user_id: userId,
    slug: body.slug,
    granted: result.rowCount && result.rowCount > 0,
  });
}
