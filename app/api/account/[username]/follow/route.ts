import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/[username]/follow
 * DELETE /api/account/[username]/follow
 *
 * Idempotent on both sides: POST upserts via ON CONFLICT DO NOTHING;
 * DELETE silently no-ops when no follow row exists. Self-follow is
 * blocked by a CHECK constraint on the table; we 400 here too for a
 * cleaner error path.
 *
 * The follower/following count columns are kept in sync by the
 * trigger pair installed in migrations/2026-05-09-scans-follows-twitter-profile.sql.
 */
async function resolveTarget(username: string): Promise<string | null> {
  const pool = getPool();
  const normalised = username.trim().toLowerCase();
  if (!normalised) return null;
  const direct = await pool.query<{ user_id: string }>(
    `select user_id from profiles where display_name = $1 limit 1`,
    [normalised],
  );
  if (direct.rows.length > 0) return direct.rows[0].user_id;
  const aliased = await pool.query<{ user_id: string }>(
    `select user_id from profiles
      where $1 = any(coalesce(previous_usernames, array[]::text[]))
      limit 1`,
    [normalised],
  );
  return aliased.rows[0]?.user_id ?? null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { username } = await params;
  const targetId = await resolveTarget(username);
  if (!targetId) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: 'cannot_follow_self' }, { status: 400 });
  }
  const pool = getPool();
  await pool.query(
    `insert into follows (follower_user_id, followed_user_id)
     values ($1, $2)
     on conflict (follower_user_id, followed_user_id) do nothing`,
    [user.id, targetId],
  );
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { username } = await params;
  const targetId = await resolveTarget(username);
  if (!targetId) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }
  const pool = getPool();
  await pool.query(
    `delete from follows where follower_user_id = $1 and followed_user_id = $2`,
    [user.id, targetId],
  );
  return NextResponse.json({ ok: true, following: false });
}
