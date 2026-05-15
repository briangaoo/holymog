import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/home
 *
 * Public endpoint that drives the homepage's "live activity" strip
 * + the personal snapshot chip. Returns whatever is cheap to compute
 * from a few count queries, plus a slim `me` block when the caller
 * is signed in.
 *
 * `activity`:
 *   - scans_today: COUNT(scan_history) since today's UTC midnight.
 *   - battles_live: battles in lobby / starting / active.
 *   - s_tier_today: scans today scoring >= 95 (S+ tier threshold).
 *   - top_today: highest-overall scan today with the user's display
 *     name attached. Null when nobody has scanned today.
 *
 * `me` (only when signed in):
 *   - elo, current_streak, best_scan_overall from profiles.
 *   - scans_today: this user's scan_history count since UTC midnight.
 *
 * Today is UTC-midnight aligned everywhere — admin glance, not
 * analytics. All queries are bounded by indexes already in place
 * for /api/admin/metrics.
 */
export async function GET() {
  const pool = getPool();
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [scansToday, battlesLive, sTierToday, topToday, meRow, meScansToday] =
    await Promise.all([
      pool.query<{ c: string }>(
        "select count(*)::text as c from scan_history where created_at >= date_trunc('day', now())",
      ),
      pool.query<{ c: string }>(
        `select count(*)::text as c from battles where state in ('lobby','starting','active')`,
      ),
      pool.query<{ c: string }>(
        "select count(*)::text as c from scan_history where created_at >= date_trunc('day', now()) and overall >= 95",
      ),
      pool.query<{ overall: number; display_name: string | null }>(
        `select sh.overall, p.display_name
           from scan_history sh
           left join profiles p on p.user_id = sh.user_id
          where sh.created_at >= date_trunc('day', now())
          order by sh.overall desc
          limit 1`,
      ),
      userId
        ? pool.query<{
            elo: number;
            current_streak: number;
            best_scan_overall: number | null;
          }>(
            `select elo, current_streak, best_scan_overall
               from profiles
              where user_id = $1
              limit 1`,
            [userId],
          )
        : Promise.resolve({
            rows: [] as Array<{
              elo: number;
              current_streak: number;
              best_scan_overall: number | null;
            }>,
          }),
      userId
        ? pool.query<{ c: string }>(
            `select count(*)::text as c
               from scan_history
              where user_id = $1
                and created_at >= date_trunc('day', now())`,
            [userId],
          )
        : Promise.resolve({ rows: [] as Array<{ c: string }> }),
    ]);

  const top = topToday.rows[0];
  const me = meRow.rows[0];

  return NextResponse.json({
    activity: {
      scans_today: Number(scansToday.rows[0]?.c ?? 0),
      battles_live: Number(battlesLive.rows[0]?.c ?? 0),
      s_tier_today: Number(sTierToday.rows[0]?.c ?? 0),
      top_today:
        top && top.display_name
          ? { display_name: top.display_name, score: top.overall }
          : null,
    },
    me: me
      ? {
          elo: me.elo,
          current_streak: me.current_streak,
          best_scan_overall: me.best_scan_overall,
          scans_today: Number(meScansToday.rows[0]?.c ?? 0),
        }
      : null,
  });
}
