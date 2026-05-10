import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/reset-stats
 *
 * Zeros out the signed-in user's profile stats: ELO is reset to the
 * starting value (1000), all match counters and streaks return to
 * zero, the improvement-counts histogram empties, and the best-scan
 * is cleared. Battle history (battle_participants rows) is NOT
 * touched — those records are kept for the historical leaderboard
 * and integrity of past battles' scoreboards.
 *
 * Use this when a user wants a fresh ladder run without deleting
 * their account or leaderboard entry.
 */
export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  await pool.query(
    `update profiles
        set elo = 1000,
            peak_elo = 1000,
            matches_played = 0,
            matches_won = 0,
            current_streak = 0,
            longest_streak = 0,
            improvement_counts = '{}'::jsonb,
            best_scan = NULL,
            best_scan_overall = NULL
      where user_id = $1`,
    [user.id],
  );

  return NextResponse.json({ ok: true });
}
