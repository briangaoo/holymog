import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendEmail, verifyCronAuth } from '@/lib/email';
import { youGotMoggedEmail } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_N = 100;
const ALERT_COOLDOWN_HOURS = 24;

type DisplacedRow = {
  user_id: string;
  email: string;
  display_name: string;
  your_score: number;
  by_display_name: string;
  new_top_score: number;
};

/**
 * Hourly check for top-N leaderboard displacement. For users who opted
 * into `mog_alerts`, if a new entry has bumped their best scan out of
 * the top N within the last hour, fire a "you got mogged" email.
 *
 * Cooldown: at most one alert per user per 24h to keep volume sane on
 * volatile leaderboards. Tracked via `email_preferences.last_digest_sent_at`
 * is for digests only — for mog alerts we rely on a per-user audit_log
 * row keyed by `mog_alert_sent` action.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();

  // Pull the current top-N + each user's best leaderboard score. For
  // each user with `mog_alerts = true` whose current best wouldn't make
  // the cutoff, AND who was in the top N within the last 24h (i.e. they
  // were recently bumped, not a long-time non-charter), email them.
  //
  // Detection: leaderboard.created_at < bump_window AND user_id is
  // in `recently_bumped` set. We approximate "bumped" by comparing
  // current cutoff against the user's overall — anyone above the
  // cutoff is in, anyone below who'd previously have made it must
  // have been bumped (assuming top-N hasn't shrunk).
  const cutoffResult = await pool.query<{ cutoff: number }>(
    `select coalesce(min(overall), 0) as cutoff
       from (select overall from leaderboard order by overall desc limit $1) t`,
    [TOP_N],
  );
  const cutoff = cutoffResult.rows[0]?.cutoff ?? 0;
  if (cutoff === 0) {
    return NextResponse.json({ ok: true, eligible: 0, sent: 0, reason: 'empty_board' });
  }

  // Find candidate users: opted in, on the leaderboard with overall <
  // cutoff, who haven't received a mog_alert in the last 24h.
  const candidates = await pool.query<DisplacedRow>(
    `select
       u.id as user_id,
       u.email,
       p.display_name,
       l.overall as your_score,
       (select l2.name
          from leaderboard l2
         where l2.created_at > now() - interval '1 hour'
           and l2.overall >= $2
         order by l2.overall desc, l2.created_at desc
         limit 1) as by_display_name,
       (select l2.overall
          from leaderboard l2
         where l2.created_at > now() - interval '1 hour'
           and l2.overall >= $2
         order by l2.overall desc, l2.created_at desc
         limit 1) as new_top_score
       from users u
       join profiles p on p.user_id = u.id
       join email_preferences ep on ep.user_id = u.id
       join leaderboard l on l.user_id = u.id
      where ep.mog_alerts = true
        and u.email is not null
        and l.overall < $2
        and not exists (
          select 1 from audit_log a
           where a.user_id = u.id
             and a.action = 'mog_alert_sent'
             and a.created_at > now() - interval '${ALERT_COOLDOWN_HOURS} hours'
        )
      limit 200`,
    [TOP_N, cutoff],
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates.rows) {
    if (!row.by_display_name || row.new_top_score == null) {
      skipped++;
      continue;
    }

    const message = youGotMoggedEmail({
      display_name: row.display_name,
      by_display_name: row.by_display_name,
      new_top_score: row.new_top_score,
      your_score: row.your_score,
    });

    const result = await sendEmail({
      to: row.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: 'kind', value: 'mog_alert' }],
    });

    if (result.ok) {
      await pool
        .query(
          `insert into audit_log (user_id, action, metadata)
             values ($1, 'mog_alert_sent', $2::jsonb)`,
          [
            row.user_id,
            JSON.stringify({
              by: row.by_display_name,
              new_score: row.new_top_score,
              your_score: row.your_score,
            }),
          ],
        )
        .catch(() => {});
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    candidates: candidates.rows.length,
    sent,
    skipped,
    failed,
  });
}
