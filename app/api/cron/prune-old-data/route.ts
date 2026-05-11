import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyCronAuth } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily prune cron. Hits the database with a fixed-cost cleanup of
 * old / orphaned rows across several tables.
 *
 * GDPR Art. 5(1)(e) — "kept in a form which permits identification
 * of data subjects for no longer than is necessary." Holding stale
 * battle history / rate-limit telemetry / pending submissions
 * indefinitely violates the principle, so we explicitly bound
 * retention here.
 *
 * Schedule (vercel.json): `0 3 * * *` — 03:00 UTC daily. Low-traffic
 * window minimises the chance of locks colliding with live writes.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` per Vercel Cron
 * convention. Anything else gets 401.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pool = getPool();
  const results: Record<string, number> = {};

  // scan_attempts: rate-limit telemetry. 90 days is plenty for
  // forensics; older rows just sit there forever otherwise.
  try {
    const r = await pool.query(
      `delete from scan_attempts where created_at < now() - interval '90 days'`,
    );
    results.scan_attempts = r.rowCount ?? 0;
  } catch (e) {
    results.scan_attempts_error = -1;
    // eslint-disable-next-line no-console
    console.error('[prune] scan_attempts:', e);
  }

  // matchmaking_queue: pair_two() already prunes >60s rows, but if
  // someone tabbed away mid-queue it can linger. Belt + braces.
  try {
    const r = await pool.query(
      `delete from matchmaking_queue where created_at < now() - interval '5 minutes'`,
    );
    results.matchmaking_queue = r.rowCount ?? 0;
  } catch (e) {
    results.matchmaking_queue_error = -1;
    // eslint-disable-next-line no-console
    console.error('[prune] matchmaking_queue:', e);
  }

  // battles: finished/abandoned older than a year. Cascades to
  // battle_participants via FK on delete. Active subscribers get
  // history retained — but Launch 1 has no real subscribers yet so
  // this branch is moot; revisit when holymog+ ships.
  try {
    const r = await pool.query(
      `delete from battles
         where state in ('finished', 'abandoned')
           and coalesce(finished_at, created_at) < now() - interval '1 year'`,
    );
    results.battles = r.rowCount ?? 0;
  } catch (e) {
    results.battles_error = -1;
    // eslint-disable-next-line no-console
    console.error('[prune] battles:', e);
  }

  // audit_log: forensic value drops sharply after a year. Retention
  // policy in /privacy says 1y.
  try {
    const r = await pool.query(
      `delete from audit_log where created_at < now() - interval '1 year'`,
    );
    results.audit_log = r.rowCount ?? 0;
  } catch (e) {
    results.audit_log_error = -1;
    // eslint-disable-next-line no-console
    console.error('[prune] audit_log:', e);
  }

  // pending_leaderboard_submissions: TTL 1 hour. Promotes that don't
  // happen within an hour expire and the user has to re-scan.
  // Wrapped because the table only exists after the consolidated SQL
  // migration runs; until then this is a no-op via the catch branch.
  try {
    const r = await pool.query(
      `delete from pending_leaderboard_submissions
         where created_at < now() - interval '1 hour'`,
    );
    results.pending_leaderboard_submissions = r.rowCount ?? 0;
  } catch {
    // table may not exist yet (pre-consolidated-migration); ignore.
    results.pending_leaderboard_submissions = 0;
  }

  return NextResponse.json({ ok: true, pruned: results });
}
