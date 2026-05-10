import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendEmail, verifyCronAuth } from '@/lib/email';
import { weeklyDigestEmail } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 100;
const DIGEST_INTERVAL_DAYS = 6;

type DigestRow = {
  user_id: string;
  email: string;
  display_name: string;
  battles_played_week: number;
  battles_won_week: number;
  earliest_elo: number | null;
  latest_elo: number;
  best_scan_week: number | null;
  scans_this_week: number;
};

/**
 * Sunday weekly digest. Vercel Cron is configured for `0 12 * * 0` —
 * fires at noon UTC every Sunday. Each invocation handles up to
 * BATCH_SIZE eligible users; cron retries until everyone's caught up
 * (digest is idempotent within the 6-day window via
 * `last_digest_sent_at`).
 *
 * Eligibility: `email_preferences.weekly_digest = true` AND
 * `last_digest_sent_at` is null or older than 6 days. Joining users
 * always includes the email + display name.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();

  // Pull eligible users + the stats they need in one round-trip per user
  // chunk. The aggregates here use `created_at > now() - interval` instead
  // of any week-boundary calculation so the digest reflects "what
  // happened in the last 7 days" regardless of when the cron fires.
  const eligible = await pool.query<DigestRow>(
    `with eligible as (
       select ep.user_id
         from email_preferences ep
        where ep.weekly_digest = true
          and (ep.last_digest_sent_at is null
               or ep.last_digest_sent_at < now() - interval '${DIGEST_INTERVAL_DAYS} days')
        limit $1
     )
     select
       u.id as user_id,
       u.email,
       p.display_name,
       (select count(*)::int
          from battle_participants bp
          join battles b on b.id = bp.battle_id
         where bp.user_id = u.id
           and b.state = 'finished'
           and b.finished_at > now() - interval '7 days') as battles_played_week,
       (select count(*)::int
          from battle_participants bp
          join battles b on b.id = bp.battle_id
         where bp.user_id = u.id
           and b.state = 'finished'
           and bp.is_winner
           and b.finished_at > now() - interval '7 days') as battles_won_week,
       (select elo
          from elo_history
         where user_id = u.id
           and recorded_at > now() - interval '7 days'
         order by recorded_at asc
         limit 1) as earliest_elo,
       p.elo as latest_elo,
       (select max(overall)::int
          from scan_history
         where user_id = u.id
           and created_at > now() - interval '7 days') as best_scan_week,
       (select count(*)::int
          from scan_history
         where user_id = u.id
           and created_at > now() - interval '7 days') as scans_this_week
       from eligible e
       join users u on u.id = e.user_id
       join profiles p on p.user_id = u.id
      where u.email is not null`,
    [BATCH_SIZE],
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of eligible.rows) {
    const noActivity =
      row.battles_played_week === 0 &&
      row.scans_this_week === 0 &&
      (row.earliest_elo == null);
    if (noActivity) {
      // Don't email a user whose week was empty; just stamp the
      // last-sent so we don't reprocess them every hour.
      await pool
        .query(
          `update email_preferences set last_digest_sent_at = now() where user_id = $1`,
          [row.user_id],
        )
        .catch(() => {});
      skipped++;
      continue;
    }

    const eloDelta =
      row.earliest_elo == null ? 0 : row.latest_elo - row.earliest_elo;
    const message = weeklyDigestEmail({
      display_name: row.display_name,
      battles: row.battles_played_week,
      battles_won: row.battles_won_week,
      elo_delta: eloDelta,
      best_scan: row.best_scan_week,
      scans_this_week: row.scans_this_week,
    });

    const result = await sendEmail({
      to: row.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: 'kind', value: 'weekly_digest' }],
    });

    if (result.ok) {
      await pool
        .query(
          `update email_preferences set last_digest_sent_at = now() where user_id = $1`,
          [row.user_id],
        )
        .catch(() => {});
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.rows.length,
    sent,
    skipped,
    failed,
  });
}
