import { getPool } from '@/lib/db';
import { getSupabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { verifyReviewToken, type ReviewAction } from '@/lib/reviewToken';
import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Landing page for the one-click admin review links embedded in
 * high-score review emails. Tokens are HMAC-signed against
 * AUTH_SECRET (lib/reviewToken.ts) and tied to a specific
 * (scanId, action) pair with a 7-day expiry.
 *
 * Approve:  audit-only — leaves all DB state intact. The user keeps
 *           their leaderboard entry, photo, and pending submission.
 *
 * Decline:  removes the user's leaderboard row + leaderboard photo
 *           from storage, deletes any pending submission so they
 *           can't re-promote the same scan, and audit-logs the
 *           action. The scan_history row itself stays (it belongs to
 *           the user; only the public-board surfacing is reversed).
 */
export default async function ReviewActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ scanId: string; action: string }>;
  searchParams: Promise<{ token?: string; expires?: string }>;
}) {
  const { scanId, action: actionRaw } = await params;
  const { token, expires: expiresRaw } = await searchParams;

  if (actionRaw !== 'approve' && actionRaw !== 'decline') {
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
  if (!verifyReviewToken({ scanId, action, expires, token })) {
    return (
      <Result
        kind="error"
        message="this link is invalid or has expired. each review link is good for 7 days; ask the system to re-flag the scan if you still need to review it."
      />
    );
  }

  const pool = getPool();
  const { rows: scanRows } = await pool.query<{ user_id: string }>(
    `select user_id from scan_history where id = $1 limit 1`,
    [scanId],
  );
  if (scanRows.length === 0) {
    return (
      <Result
        kind="success"
        action={action}
        message="this scan no longer exists. nothing to do."
      />
    );
  }
  const userId = scanRows[0].user_id;

  if (action === 'approve') {
    void recordAudit({
      userId,
      action: 'scan_approved',
      resource: scanId,
      metadata: { by: 'email_review' },
    });
    return (
      <Result
        kind="success"
        action="approve"
        message="acknowledged. the user's leaderboard entry stays as-is — no DB changes were made."
      />
    );
  }

  // Decline: clean up the leaderboard surface for this user.
  const supabase = getSupabaseAdmin();
  let removedPhoto = false;
  if (supabase) {
    const { data: lbRow } = await supabase
      .from('leaderboard')
      .select('image_path')
      .eq('user_id', userId)
      .maybeSingle();
    const imagePath = lbRow?.image_path ?? null;
    await supabase.from('leaderboard').delete().eq('user_id', userId);
    if (imagePath) {
      const { error } = await supabase.storage
        .from(UPLOADS_BUCKET)
        .remove([imagePath]);
      removedPhoto = !error;
    }
  }
  await pool.query(
    `delete from pending_leaderboard_submissions where user_id = $1`,
    [userId],
  );

  void recordAudit({
    userId,
    action: 'scan_declined',
    resource: scanId,
    metadata: { by: 'email_review', removed_photo: removedPhoto },
  });

  return (
    <Result
      kind="success"
      action="decline"
      message="leaderboard entry removed and pending submission cleared. the user's scan history is untouched — they can scan again to retry the board."
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
      : action === 'approve'
        ? 'Approved'
        : action === 'decline'
          ? 'Declined'
          : 'Done';
  const accent =
    kind === 'error' ? '#dc2626' : action === 'decline' ? '#dc2626' : '#059669';

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
