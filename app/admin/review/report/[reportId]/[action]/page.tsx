import Link from 'next/link';
import { getPool } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { banNoticeEmail } from '@/lib/email-templates';
import { verifyReviewToken, type ReviewAction } from '@/lib/reviewToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Landing for the one-click admin action links in the battle report
 * email. Tokens are HMAC-signed against AUTH_SECRET (lib/reviewToken.ts)
 * and tied to a specific (reportId, action) pair with a 7-day expiry.
 *
 * `ban` path:
 *   - Set the reported user's `profiles.banned_at` + `banned_reason`.
 *   - Purge every session for that user (forces immediate sign-out
 *     across devices — the Auth.js `signIn` callback then blocks new
 *     sessions on the next attempt).
 *   - Mark the report `banned`.
 *   - Email the user a ban notice.
 *   - Audit-log.
 *
 * `dismiss` path:
 *   - Mark the report `dismissed`. No DB change against the user, no
 *     email. The reporter never learns the outcome.
 */
export default async function ReportActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string; action: string }>;
  searchParams: Promise<{ token?: string; expires?: string }>;
}) {
  const { reportId, action: actionRaw } = await params;
  const { token, expires: expiresRaw } = await searchParams;

  if (actionRaw !== 'ban' && actionRaw !== 'dismiss') {
    return <Result kind="error" message="invalid action" />;
  }
  const action = actionRaw as ReviewAction;

  if (!token || !expiresRaw) {
    return <Result kind="error" message="missing token" />;
  }
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires)) {
    return <Result kind="error" message="invalid expiration" />;
  }
  if (!verifyReviewToken({ scanId: reportId, action, expires, token })) {
    return (
      <Result
        kind="error"
        message="this link is invalid or has expired. each action link is good for 7 days; re-flag the report to get a fresh pair."
      />
    );
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
    return (
      <Result
        kind="success"
        action={action}
        message="this report no longer exists. nothing to do."
      />
    );
  }
  const report = reportRow.rows[0];
  if (report.state !== 'pending') {
    return (
      <Result
        kind="success"
        action={action}
        message={`this report has already been resolved (state: ${report.state}).`}
      />
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
      metadata: { reason: report.reason },
    });
    return (
      <Result
        kind="success"
        action="dismiss"
        message="report dismissed. no action against the user, no email, nothing surfaced. the reporter is not notified either."
      />
    );
  }

  // Ban path. Single transaction so a partial state can't leave a
  // user in "report resolved but sessions still active" land.
  const client = await pool.connect();
  let userName = 'player';
  let userEmail: string | null = null;
  try {
    await client.query('begin');

    // Pull display name + email so we can deliver the ban notice and
    // log a useful audit record. Hits both `users` (for email) and
    // `profiles` (for display_name).
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
      [report.reason, report.reported_user_id],
    );

    // Kill every session immediately. New sign-ins land in the
    // signIn callback in lib/auth.ts which checks banned_at and
    // returns false.
    await client.query(`delete from sessions where "userId" = $1`, [
      report.reported_user_id,
    ]);

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
    return (
      <Result
        kind="error"
        message={`could not apply the ban: ${
          err instanceof Error ? err.message : 'unknown error'
        }`}
      />
    );
  } finally {
    client.release();
  }

  void recordAudit({
    userId: report.reported_user_id,
    action: 'user_banned',
    resource: reportId,
    metadata: { reason: report.reason, by: 'email_review' },
  });

  if (userEmail) {
    const { subject, html, text } = banNoticeEmail({
      display_name: userName,
      reason: report.reason,
    });
    void sendEmail({
      to: userEmail,
      subject,
      html,
      text,
      tags: [{ name: 'kind', value: 'ban_notice' }],
    });
  }

  return (
    <Result
      kind="success"
      action="ban"
      message="user banned. sign-in is disabled, every active session has been ended, and a notice email has been sent. the reporter is not told."
    />
  );
}

function Result({
  kind,
  action,
  message,
}: {
  kind: 'success' | 'error';
  action?: ReviewAction;
  message: string;
}) {
  const heading =
    kind === 'error'
      ? "Couldn't apply that action"
      : action === 'ban'
        ? 'User banned'
        : action === 'dismiss'
          ? 'Report dismissed'
          : 'Done';
  const accent =
    kind === 'error' ? '#dc2626' : action === 'ban' ? '#dc2626' : '#059669';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        fontFamily:
          "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
        color: '#0a0a0a',
        // Admin pages use sentence-case formal copy; opt out of the
        // global body { text-transform: lowercase; } rule.
        textTransform: 'none',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <p
          style={{
            margin: 0,
            paddingBottom: 32,
            fontFamily:
              "'IBM Plex Mono', ui-monospace, Menlo, Monaco, monospace",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: '#737373',
          }}
        >
          holymog
        </p>
        <h1
          style={{
            margin: 0,
            paddingBottom: 12,
            fontSize: 30,
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: accent,
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            margin: 0,
            paddingBottom: 32,
            fontSize: 15,
            lineHeight: 1.55,
            color: '#525252',
          }}
        >
          {message}
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '12px 22px',
            background: '#0a0a0a',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            borderRadius: 9999,
          }}
        >
          back to holymog
        </Link>
      </div>
    </main>
  );
}
