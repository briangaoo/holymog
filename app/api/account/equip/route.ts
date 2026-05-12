import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isSubscriber } from '@/lib/subscription';
import { isFounderOnlySlug } from '@/lib/customization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['frame', 'badge', 'theme', 'name_fx']);

/**
 * POST /api/account/equip { slug }
 *
 * Validates the slug against catalog_items, enforces subscriber-only
 * gating, checks ownership (except for subscriber-only items where
 * holymog+ status grants implicit access), then writes the slug to
 * the matching `equipped_*` column on the profile.
 *
 * Sub-only items: subscribers can equip without an inventory row
 * (the subscription itself is the entitlement). Non-subscribers
 * trying to equip a sub-only item get 403.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
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

  // Founder-only items: even if a stray user_inventory row exists for
  // someone else (manual SQL mistake, etc.), they still can't equip
  // these. The FOUNDER_USER_ID env var is the single source of truth.
  if (isFounderOnlySlug(slug)) {
    const founderUserId = process.env.FOUNDER_USER_ID;
    if (!founderUserId || user.id !== founderUserId) {
      return NextResponse.json({ error: 'not_owned' }, { status: 403 });
    }
  }

  const pool = getPool();
  const itemRow = await pool.query<{ kind: string; subscriber_only: boolean }>(
    `select kind, coalesce(subscriber_only, false) as subscriber_only
       from catalog_items
      where slug = $1 and active = true
      limit 1`,
    [slug],
  );
  if (itemRow.rows.length === 0) {
    return NextResponse.json({ error: 'unknown_slug' }, { status: 404 });
  }
  const { kind, subscriber_only } = itemRow.rows[0];
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'unknown_kind' }, { status: 500 });
  }

  if (subscriber_only) {
    const subscriber = await isSubscriber(user.id);
    if (!subscriber) {
      return NextResponse.json(
        {
          error: 'subscriber_only_item',
          message: 'this item is exclusive to holymog+ subscribers',
        },
        { status: 403 },
      );
    }
    // Subscribers can equip sub-only items without an inventory row.
  } else {
    // Non-sub-only items require ownership.
    const owns = await pool.query<{ id: string }>(
      `select id from user_inventory where user_id = $1 and item_slug = $2 limit 1`,
      [user.id, slug],
    );
    if (owns.rows.length === 0) {
      return NextResponse.json({ error: 'not_owned' }, { status: 403 });
    }
  }

  const column =
    kind === 'frame'
      ? 'equipped_frame'
      : kind === 'theme'
        ? 'equipped_theme'
        : kind === 'name_fx'
          ? 'equipped_name_fx'
          : 'equipped_flair'; // badges go in equipped_flair (single slot for now)

  await pool.query(
    `update profiles set ${column} = $1 where user_id = $2`,
    [slug, user.id],
  );

  return NextResponse.json({ ok: true, kind, slug });
}
