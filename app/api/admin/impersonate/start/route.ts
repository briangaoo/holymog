import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_SEC,
  requireAdmin,
  signImpersonationCookie,
} from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Begin admin impersonation. Sets a signed cookie alongside the
 * admin's normal session that lib/auth.ts session() callback uses to
 * swap the effective user.id on every subsequent request.
 *
 * Body: { userId: <target uuid> }.
 *
 * Refuses self-impersonation (would be a confusing no-op) and bails
 * if the target row doesn't exist. Audits both the start event and
 * — via lib/audit.ts cookie inspection — every action taken while
 * impersonating.
 */

type Body = {
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
    const { success } = await limiter.limit(
      `admin:impersonate-start:${admin.userId}`,
    );
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }
  if (userId === admin.userId) {
    return NextResponse.json({ error: 'cannot_impersonate_self' }, { status: 400 });
  }

  // Confirm the target exists. We don't want a typo cookie that swaps
  // session.user.id to a nonexistent uuid — half the app would then
  // 404 in confusing ways.
  const pool = getPool();
  const r = await pool.query<{ display_name: string }>(
    'select display_name from profiles where user_id = $1 limit 1',
    [userId],
  );
  const targetDisplay = r.rows[0]?.display_name;
  if (!targetDisplay) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  const cookieValue = signImpersonationCookie({
    adminUserId: admin.userId,
    targetUserId: userId,
  });

  void recordAudit({
    userId: admin.userId,
    action: 'admin_impersonate_start',
    resource: userId,
    metadata: { target_display_name: targetDisplay },
  });

  const res = NextResponse.json({
    ok: true,
    target: { user_id: userId, display_name: targetDisplay },
  });
  res.cookies.set({
    name: IMPERSONATION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: IMPERSONATION_TTL_SEC,
  });
  return res;
}
