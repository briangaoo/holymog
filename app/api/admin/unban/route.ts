import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unban a previously-banned user. Clears banned_at + banned_reason on
 * the profile row. Existing sessions are still gone (the ban purged
 * them) — the user has to sign in fresh, which is now permitted again
 * because the signIn callback in lib/auth.ts only blocks while
 * banned_at is non-null.
 */

type UnbanBody = {
  userId?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const guard = requireSameOrigin(request);
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:unban:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: UnbanBody;
  try {
    body = (await request.json()) as UnbanBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  const pool = getPool();
  const result = await pool.query<{ banned_at: Date | null }>(
    `update profiles
        set banned_at = null,
            banned_reason = null
      where user_id = $1
      returning banned_at`,
    [userId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  void recordAudit({
    userId,
    action: 'user_unbanned',
    resource: userId,
    metadata: { by: 'admin_console', operator: admin.userId },
  });

  return NextResponse.json({ ok: true });
}
