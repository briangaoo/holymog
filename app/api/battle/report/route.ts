import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { BATTLES_BUCKET, getSupabaseAdmin } from '@/lib/supabase';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { publicError } from '@/lib/errors';
import { parseJsonBody } from '@/lib/parseRequest';
import { BattleReportBody } from '@/lib/schemas/report';
import { signReviewToken } from '@/lib/reviewToken';
import { sendEmail, appUrl } from '@/lib/email';
import { battleReportEmail } from '@/lib/email-templates';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/battle/report
 *
 * The public-1v1 post-match report endpoint. Body:
 *   { battle_id, reported_user_id, reason, details? }
 *
 * Guards (all server-side):
 *   - Origin guard + auth required + rate-limit (10/h per user)
 *   - Battle must exist, be `kind = 'public'`, and be in `finished`/`abandoned` state.
 *     (Private battles are explicitly excluded — friends-of-friends parties
 *     don't need the report surface; users can email hello@holymog.com.)
 *   - Caller must have been a participant in that battle.
 *   - Reported user must have been a DIFFERENT participant in that battle.
 *   - Deduped at the DB layer via UNIQUE (battle_id, reporter, reported).
 *
 * Effects:
 *   - Inserts a `battle_reports` row (state = 'pending').
 *   - Looks up the reported player's peak frame from `battle_participants`,
 *     mints a 7-day signed URL from the `holymog-battles` private bucket.
 *   - Mints HMAC-signed ban + dismiss URLs.
 *   - Emails `ADMIN_REVIEW_EMAIL` with the image + action links.
 *   - Audit-logs the report submission.
 *
 * The reported user is NEVER notified at this stage — only on the
 * eventual admin "ban" action via banNoticeEmail.
 */
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status });

  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json(publicError('unauthenticated'), { status: 401 });
  }

  const limiter = getRatelimit('battleReport');
  if (limiter) {
    const result = await limiter.limit(user.id);
    if (!result.success) {
      return NextResponse.json(publicError('rate_limited'), { status: 429 });
    }
  }

  const parsed = await parseJsonBody(request, BattleReportBody);
  if ('error' in parsed) return parsed.error;
  const { battle_id: battleId, reported_user_id: reportedUserId, reason, details } = parsed.data;

  if (reportedUserId === user.id) {
    return NextResponse.json(publicError('cannot_report_self'), { status: 400 });
  }

  const pool = getPool();

  // Validate the battle + participation in a single query. Returns
  // null when the caller wasn't a participant or the reported user
  // wasn't either, so a single 403 covers both cases (deliberately
  // doesn't disambiguate so a curious attacker can't enumerate the
  // participant list of a battle they weren't in).
  const battleRow = await pool.query<{
    kind: 'public' | 'private';
    state: string;
    reporter_in_battle: boolean;
    reported_in_battle: boolean;
  }>(
    `select b.kind, b.state,
            exists(
              select 1 from battle_participants p
                where p.battle_id = b.id and p.user_id = $2
            ) as reporter_in_battle,
            exists(
              select 1 from battle_participants p
                where p.battle_id = b.id and p.user_id = $3
            ) as reported_in_battle
       from battles b
      where b.id = $1
      limit 1`,
    [battleId, user.id, reportedUserId],
  );
  const battle = battleRow.rows[0];
  if (!battle) {
    return NextResponse.json(publicError('battle_not_found'), { status: 404 });
  }
  if (!battle.reporter_in_battle || !battle.reported_in_battle) {
    return NextResponse.json(publicError('not_a_participant'), { status: 403 });
  }
  if (battle.kind !== 'public') {
    return NextResponse.json(
      publicError(
        'private_battle',
        undefined,
        'private battles aren’t reportable in-app — email hello@holymog.com instead.',
      ),
      { status: 400 },
    );
  }
  // Only allow reports against finished / abandoned battles — prevents a
  // griefer from filing during a still-active match.
  if (battle.state !== 'finished' && battle.state !== 'abandoned') {
    return NextResponse.json(publicError('battle_not_finished'), { status: 409 });
  }

  // Idempotent insert. UNIQUE on (battle_id, reporter_user_id,
  // reported_user_id) means re-submitting against the same opponent
  // for the same battle is a no-op — the original report stays the
  // authoritative one and no second email goes out.
  const insertResult = await pool.query<{ id: string; inserted: boolean }>(
    `insert into battle_reports
       (battle_id, reporter_user_id, reported_user_id, reason, details)
       values ($1, $2, $3, $4, $5)
       on conflict (battle_id, reporter_user_id, reported_user_id) do nothing
       returning id, true as inserted`,
    [battleId, user.id, reportedUserId, reason, details ?? null],
  );

  if (insertResult.rows.length === 0) {
    // Already reported. Don't tell the reporter to avoid feedback that
    // could be abused (e.g., a stalker probing whether a target has
    // been re-reported). Same 200 shape as a fresh submit.
    void recordAudit({
      userId: user.id,
      action: 'battle_report_duplicate',
      resource: battleId,
      metadata: { reason, reported: reportedUserId },
    });
    return NextResponse.json({ ok: true });
  }
  const reportId = insertResult.rows[0].id;

  // Look up display names + the reported user's peak frame path.
  const namesRow = await pool.query<{
    reporter_name: string;
    reported_name: string;
    peak_image_path: string | null;
  }>(
    `select rp.display_name as reporter_name,
            tp.display_name as reported_name,
            tp.peak_image_path
       from battle_participants rp,
            battle_participants tp
      where rp.battle_id = $1 and rp.user_id = $2
        and tp.battle_id = $1 and tp.user_id = $3
      limit 1`,
    [battleId, user.id, reportedUserId],
  );
  const names = namesRow.rows[0] ?? {
    reporter_name: 'unknown',
    reported_name: 'unknown',
    peak_image_path: null,
  };

  // Sign a 7-day URL on the private bucket if we have a peak path.
  let imageUrl: string | null = null;
  const supabase = getSupabaseAdmin();
  if (supabase && names.peak_image_path) {
    const { data: signed } = await supabase.storage
      .from(BATTLES_BUCKET)
      .createSignedUrl(names.peak_image_path, 60 * 60 * 24 * 7);
    imageUrl = signed?.signedUrl ?? null;
  }

  // Sign ban + dismiss URLs (7-day TTL, HMAC over reportId+action).
  const ban = signReviewToken(reportId, 'ban');
  const dismiss = signReviewToken(reportId, 'dismiss');
  const buildActionUrl = (action: 'ban' | 'dismiss', token: string, expires: number) =>
    `${appUrl(`/admin/review/report/${reportId}/${action}`)}?token=${token}&expires=${expires}`;

  // Best-effort admin email. Failure doesn't unwind the report row —
  // we'd rather have a record we can manually act on than nothing.
  const adminTo = process.env.ADMIN_REVIEW_EMAIL;
  if (adminTo) {
    const { subject, html, text } = battleReportEmail({
      reportId,
      battleId,
      reporterUserId: user.id,
      reporterDisplayName: names.reporter_name,
      reportedUserId,
      reportedDisplayName: names.reported_name,
      reason,
      details: details ?? null,
      imageUrl,
      banUrl: buildActionUrl('ban', ban.token, ban.expires),
      dismissUrl: buildActionUrl('dismiss', dismiss.token, dismiss.expires),
    });
    void sendEmail({
      to: adminTo,
      subject,
      html,
      text,
      tags: [{ name: 'kind', value: 'battle_report' }],
    });
  }

  void recordAudit({
    userId: user.id,
    action: 'battle_report',
    resource: reportId,
    metadata: { battle_id: battleId, reported: reportedUserId, reason },
  });

  return NextResponse.json({ ok: true });
}
