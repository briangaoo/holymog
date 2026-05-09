import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type HistoryRow = {
  battle_id: string;
  kind: 'public' | 'private';
  finished_at: string | null;
  is_winner: boolean;
  peak_score: number;
  opponents: Array<{ user_id: string; display_name: string; peak_score: number }>;
};

/**
 * GET /api/account/history?page=N
 *
 * Paginated list of finished battles for the signed-in user. Each row
 * includes the battle kind, finish time, the user's own peak/win flag,
 * and a snapshot of every other participant's display name + peak so
 * the UI can render "you vs <opponent> · 84 → win" lines.
 *
 * Ordering: most recent first (finished_at desc, joined_at desc as
 * tiebreak so unfinished/abandoned rows still surface in a deterministic
 * order). Only kind in ('public','private') with state='finished'.
 */
export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const pool = getPool();

  // 1) Pull this user's recent finished battles.
  const myRows = await pool.query<{
    battle_id: string;
    kind: 'public' | 'private';
    finished_at: Date | null;
    is_winner: boolean;
    peak_score: number;
    joined_at: Date;
  }>(
    `select b.id as battle_id, b.kind, b.finished_at,
            p.is_winner, p.peak_score, p.joined_at
       from battle_participants p
       join battles b on b.id = p.battle_id
      where p.user_id = $1 and b.state = 'finished'
      order by b.finished_at desc nulls last, p.joined_at desc
      limit $2 offset $3`,
    [user.id, PAGE_SIZE, offset],
  );

  if (myRows.rows.length === 0) {
    return NextResponse.json({ entries: [], hasMore: false, page });
  }

  // 2) Fetch every OTHER participant for those battles in one shot.
  const battleIds = myRows.rows.map((r) => r.battle_id);
  const opponents = await pool.query<{
    battle_id: string;
    user_id: string;
    display_name: string;
    peak_score: number;
  }>(
    `select battle_id, user_id, display_name, peak_score
       from battle_participants
      where battle_id = any($1::uuid[]) and user_id <> $2`,
    [battleIds, user.id],
  );

  const oppByBattle = new Map<
    string,
    Array<{ user_id: string; display_name: string; peak_score: number }>
  >();
  for (const row of opponents.rows) {
    const list = oppByBattle.get(row.battle_id) ?? [];
    list.push({
      user_id: row.user_id,
      display_name: row.display_name,
      peak_score: row.peak_score,
    });
    oppByBattle.set(row.battle_id, list);
  }

  const entries: HistoryRow[] = myRows.rows.map((r) => ({
    battle_id: r.battle_id,
    kind: r.kind,
    finished_at: r.finished_at ? r.finished_at.toISOString() : null,
    is_winner: r.is_winner,
    peak_score: r.peak_score,
    opponents: oppByBattle.get(r.battle_id) ?? [],
  }));

  return NextResponse.json({
    entries,
    hasMore: entries.length === PAGE_SIZE,
    page,
  });
}
