import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { banNoticeEmail } from '@/lib/email-templates';
import { getSupabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manual admin ban — mirrors the email-review flow at
 * `app/admin/review/report/[reportId]/[action]/page.tsx` but doesn't
 * require a battle_reports row. Targets a user by user_id, with a
 * required free-text reason that's both stored on the profile and
 * mailed to the user.
 *
 * Side effects (single transaction):
 *   - profiles.banned_at = now(), banned_reason = $reason
 *   - delete every row in `sessions` for that user (immediate sign-out
 *     across every device — the Auth.js signIn callback then refuses
 *     to mint new sessions while banned_at is set)
 *   - delete the user's `leaderboard` row + any pending submission so
 *     the public board sheds them inside the same transaction. The
 *     leaderboard read paths also filter `banned_at is null` as a
 *     read-side backstop, but committing the delete here keeps the
 *     storage object owner-of-record consistent.
 *
 * Post-commit (best-effort, swallowed on error):
 *   - storage remove of the leaderboard photo (object lives in
 *     holymog-uploads under the path captured from the leaderboard
 *     row before delete)
 *   - audit-log entry (`user_banned`, by: 'admin_console')
 *   - ban-notice email if the user has an email on file
 */

type BanBody = {
  userId?: unknown;
  reason?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LEN = 500;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const guard = requireSameOrigin(request);
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:ban:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: BanBody;
  try {
    body = (await request.json()) as BanBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }
  if (!reasonRaw) {
    return NextResponse.json({ error: 'missing_reason' }, { status: 400 });
  }
  const reason = reasonRaw.slice(0, MAX_REASON_LEN);

  // Refuse to ban yourself — typo guard. Also refuse to ban another
  // admin via the console; admin removal should be an env-var change,
  // not a runtime DB write.
  if (userId === admin.userId) {
    return NextResponse.json({ error: 'cannot_ban_self' }, { status: 400 });
  }
  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.includes(userId)) {
    return NextResponse.json({ error: 'cannot_ban_admin' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let userEmail: string | null = null;
  let userName = 'player';
  let removedLeaderboardPath: string | null = null;
  try {
    await client.query('begin');

    const userRow = await client.query<{
      email: string | null;
      display_name: string | null;
      already_banned: Date | null;
    }>(
      `select u.email, p.display_name, p.banned_at as already_banned
         from users u
         left join profiles p on p.user_id = u.id
        where u.id = $1
        limit 1`,
      [userId],
    );
    if (userRow.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }
    userEmail = userRow.rows[0]?.email ?? null;
    userName = userRow.rows[0]?.display_name ?? 'player';

    await client.query(
      `update profiles
          set banned_at = now(),
              banned_reason = $1
        where user_id = $2`,
      [reason, userId],
    );

    await client.query(`delete from sessions where "userId" = $1`, [userId]);

    // Strip the public-board surfacing in the same transaction. Capture
    // the photo path on the way out so the post-commit block can
    // best-effort-remove the storage object (storage isn't part of
    // the Postgres transaction — orphans are acceptable; the row
    // being gone is the binding contract). Also drops any pending
    // submission so the user can't re-promote during a transient
    // window before sessions die elsewhere.
    const lbDelete = await client.query<{ image_path: string | null }>(
      `delete from leaderboard where user_id = $1 returning image_path`,
      [userId],
    );
    removedLeaderboardPath = lbDelete.rows[0]?.image_path ?? null;
    await client.query(
      `delete from pending_leaderboard_submissions where user_id = $1`,
      [userId],
    );

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      {
        error: 'ban_failed',
        message: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  // Storage cleanup — best-effort, orphan is acceptable. Lives outside
  // the transaction because Supabase storage isn't transactional.
  if (removedLeaderboardPath) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      void supabase.storage
        .from(UPLOADS_BUCKET)
        .remove([removedLeaderboardPath])
        .catch(() => {});
    }
  }

  void recordAudit({
    userId,
    action: 'user_banned',
    resource: userId,
    metadata: {
      reason,
      by: 'admin_console',
      operator: admin.userId,
      removed_leaderboard_photo: Boolean(removedLeaderboardPath),
    },
  });

  if (userEmail) {
    const { subject, html, text } = banNoticeEmail({
      display_name: userName,
      reason,
    });
    void sendEmail({
      to: userEmail,
      subject,
      html,
      text,
      tags: [{ name: 'kind', value: 'ban_notice' }],
    });
  }

  return NextResponse.json({ ok: true });
}
