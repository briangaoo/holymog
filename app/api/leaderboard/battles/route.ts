import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const MAX_PAGE = 1000;

export type BattleLeaderboardRow = {
  user_id: string;
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  avatar_url: string | null;
  equipped_frame: string | null;
  equipped_flair: string | null;
  equipped_name_fx: string | null;
  current_streak: number | null;
  is_subscriber: boolean;
};

/**
 * GET /api/leaderboard/battles?page=N
 *
 * Returns top profiles by current ELO. Per-user rating is cumulative,
 * so we don't gate on a minimum match count — everyone shows up at
 * their current standing. New profiles default to ELO 1000; the
 * matches_played tiebreak pushes never-played users below users at
 * the same ELO who've actually played.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Math.min(
    MAX_PAGE,
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
  );
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const pool = getPool();
    // Privacy: hide_elo excludes the user from the ELO board entirely
    // (showing the row without ELO would leak it via bounding ranks).
    // hide_photo_from_leaderboard does NOT apply here — that toggle
    // hides their submitted *scan* photo, which is a separate
    // surface from this ELO ranking.
    //
    // Banned users are excluded outright. The ban paths
    // (lib/admin*, /api/admin/ban, /api/admin/report-resolve,
    // /admin/review/report/.../ban) already delete the
    // `leaderboard` row inside the ban transaction, but this
    // `banned_at IS NULL` filter is the read-side backstop — it
    // also catches direct-SQL bans + retroactively hides any
    // existing banned-user entries that predated the ban-removes-
    // leaderboard change.
    type Raw = Omit<BattleLeaderboardRow, 'is_subscriber'> & {
      subscription_status: string | null;
    };
    const result = await pool.query<Raw>(
      `select
         p.user_id,
         p.display_name,
         p.elo,
         p.peak_elo,
         p.matches_played,
         p.matches_won,
         u.image as avatar_url,
         p.equipped_frame,
         p.equipped_flair,
         p.equipped_name_fx,
         p.current_streak,
         p.subscription_status
       from profiles p
       join users u on u.id = p.user_id
       where coalesce(p.hide_elo, false) = false
         and p.banned_at is null
       order by p.elo desc, p.matches_played desc, p.peak_elo desc
       limit $1 offset $2`,
      [PAGE_SIZE, offset],
    );
    const entries: BattleLeaderboardRow[] = result.rows.map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      elo: r.elo,
      peak_elo: r.peak_elo,
      matches_played: r.matches_played,
      matches_won: r.matches_won,
      avatar_url: r.avatar_url,
      equipped_frame: r.equipped_frame,
      equipped_flair: r.equipped_flair,
      equipped_name_fx: r.equipped_name_fx,
      current_streak: r.current_streak,
      is_subscriber:
        r.subscription_status === 'active' || r.subscription_status === 'trialing',
    }));
    return NextResponse.json({
      entries,
      hasMore: entries.length === PAGE_SIZE,
      page,
    });
  } catch (err) {
    return NextResponse.json(
      {
        entries: [] as BattleLeaderboardRow[],
        hasMore: false,
        error: err instanceof Error ? err.message : 'unknown_error',
      },
      { status: 500 },
    );
  }
}
