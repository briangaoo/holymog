import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export type BattleLeaderboardRow = {
  user_id: string;
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
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
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const pool = getPool();
    const result = await pool.query<BattleLeaderboardRow>(
      `select
         user_id,
         display_name,
         elo,
         peak_elo,
         matches_played,
         matches_won
       from profiles
       order by elo desc, matches_played desc, peak_elo desc
       limit $1 offset $2`,
      [PAGE_SIZE, offset],
    );
    const entries = result.rows;
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
