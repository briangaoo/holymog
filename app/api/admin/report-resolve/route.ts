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
 * Resolve a pending battle_report — either ban the reported user or
 * dismiss the complaint. Mirrors the one-click email-token flow in
 * `app/admin/review/report/[reportId]/[action]/page.tsx` but runs
 * from the admin console UI so an admin can triage without leaving
 * the page.
 *
 * Body:
 *   { reportId: <uuid>, action: 'ban' | 'dismiss', reasonOverride?: string }
 *
 * Ban path is transactional (banned_at + banned_reason + session
 * purge + report state) and emails the user a ban notice. Dismiss
 * just flips the report state to 'dismissed' silently — the
 * reporter is never told the outcome to prevent feedback for
 * malicious reporters probing the moderation system.
 */

type Body = {
  reportId?: unknown;
  action?: unknown;
  reasonOverride?: unknown;
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
    const { success } = await limiter.limit(
      `admin:report-resolve:${admin.userId}`,
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
  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
  const action = body.action === 'ban' || body.action === 'dismiss' ? body.action : null;
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'invalid_report_id' }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const pool = getPool();
  const reportRow = await pool.query<{
    reported_user_id: string;
    state: string;
    reason: string;
  }>(
    `select reported_user_id, state, reason
       from battle_reports
      where id = $1
      limit 1`,
    [reportId],
  );
  if (reportRow.rows.length === 0) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 });
  }
  const report = reportRow.rows[0];
  if (report.state !== 'pending') {
    return NextResponse.json(
      { error: 'already_resolved', state: report.state },
      { status: 409 },
    );
  }

  if (action === 'dismiss') {
    await pool.query(
      `update battle_reports
          set state = 'dismissed',
              resolved_at = now(),
              resolved_by_action = 'dismiss'
        where id = $1`,
      [reportId],
    );
    void recordAudit({
      userId: report.reported_user_id,
      action: 'battle_report_dismissed',
      resource: reportId,
      metadata: {
        reason: report.reason,
        by: 'admin_console',
        operator: admin.userId,
      },
    });
    return NextResponse.json({ ok: true, action: 'dismiss' });
  }

  // BAN path — single transaction (ban + session purge + report
  // flip) so partial failure leaves no half-banned state.
  const reasonRaw =
    typeof body.reasonOverride === 'string' ? body.reasonOverride.trim() : '';
  const banReason = (reasonRaw || report.reason).slice(0, MAX_REASON_LEN);

  // Don't allow banning another admin via this path either —
  // matches the safety check in /api/admin/ban.
  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.includes(report.reported_user_id)) {
    return NextResponse.json({ error: 'cannot_ban_admin' }, { status: 400 });
  }

  const client = await pool.connect();
  let userName = 'player';
  let userEmail: string | null = null;
  let removedLeaderboardPath: string | null = null;
  try {
    await client.query('begin');

    const userRow = await client.query<{
      email: string | null;
      display_name: string | null;
    }>(
      `select u.email, p.display_name
         from users u
         left join profiles p on p.user_id = u.id
        where u.id = $1
        limit 1`,
      [report.reported_user_id],
    );
    userEmail = userRow.rows[0]?.email ?? null;
    userName = userRow.rows[0]?.display_name ?? 'player';

    await client.query(
      `update profiles
          set banned_at = now(),
              banned_reason = $1
        where user_id = $2`,
      [banReason, report.reported_user_id],
    );

    await client.query(`delete from sessions where "userId" = $1`, [
      report.reported_user_id,
    ]);

    // Strip the public-board surfacing in the same transaction as the
    // ban + session purge — see /api/admin/ban for the rationale.
    const lbDelete = await client.query<{ image_path: string | null }>(
      `delete from leaderboard where user_id = $1 returning image_path`,
      [report.reported_user_id],
    );
    removedLeaderboardPath = lbDelete.rows[0]?.image_path ?? null;
    await client.query(
      `delete from pending_leaderboard_submissions where user_id = $1`,
      [report.reported_user_id],
    );

    await client.query(
      `update battle_reports
          set state = 'banned',
              resolved_at = now(),
              resolved_by_action = 'ban'
        where id = $1`,
      [reportId],
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

  // Storage cleanup is best-effort, post-commit. Orphan is acceptable;
  // the row being gone is the binding contract.
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
    userId: report.reported_user_id,
    action: 'user_banned',
    resource: reportId,
    metadata: {
      reason: banReason,
      by: 'admin_console',
      operator: admin.userId,
      removed_leaderboard_photo: Boolean(removedLeaderboardPath),
    },
  });

  if (userEmail) {
    const { subject, html, text } = banNoticeEmail({
      display_name: userName,
      reason: banReason,
    });
    void sendEmail({
      to: userEmail,
      subject,
      html,
      text,
      tags: [{ name: 'kind', value: 'ban_notice' }],
    });
  }

  return NextResponse.json({ ok: true, action: 'ban' });
}
