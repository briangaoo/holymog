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
  /** True when nobody on this battle had is_winner=true AND it had >=2
   *  participants — i.e., the peak scores matched. Surfaces as grey in
   *  the W/L ribbon and counts as a separate bucket from wins/losses. */
  is_tie: boolean;
  peak_score: number;
  // Opponent rows expose display_name + peak only. user_id is
  // intentionally NOT included in the public response — clients link
  // to /@display_name and don't need the UUID.
  opponents: Array<{ display_name: string; peak_score: number }>;
};

/**
 * GET /api/account/history
 *
 * Query params:
 *   - page=N (default 1)
 *   - kind=public|private (optional filter)
 *   - result=won|lost (optional filter)
 *   - opponent=string (optional — case-insensitive prefix match on
 *     any participant's display_name in battles the user was in)
 *
 * Each row includes the user's own peak/win flag plus a snapshot of
 * every other participant's display name + peak. The response also
 * carries a `summary` block (count, won, win_rate, peak) computed
 * over the full filtered set so the UI can render header chips
 * without a second round-trip.
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

  const kindFilter = searchParams.get('kind');
  const kind =
    kindFilter === 'public' || kindFilter === 'private' ? kindFilter : null;

  const resultFilter = searchParams.get('result');
  const result =
    resultFilter === 'won' || resultFilter === 'lost' ? resultFilter : null;

  const opponentRaw = searchParams.get('opponent') ?? '';
  const opponent = opponentRaw.trim().toLowerCase().slice(0, 24);

  const pool = getPool();

  // Build the WHERE clause incrementally. All filters AND together.
  const whereParts: string[] = [`p.user_id = $1`, `b.state = 'finished'`];
  const params: unknown[] = [user.id];
  let i = 2;

  if (kind) {
    whereParts.push(`b.kind = $${i++}`);
    params.push(kind);
  }
  if (result) {
    whereParts.push(`p.is_winner = $${i++}`);
    params.push(result === 'won');
  }
  if (opponent) {
    whereParts.push(
      `exists (
         select 1 from battle_participants op
          where op.battle_id = b.id
            and op.user_id <> $1
            and op.display_name ilike $${i}
       )`,
    );
    params.push(`${opponent}%`);
    i++;
  }
  const whereSql = whereParts.join(' and ');

  // 1) Page of matching battles.
  const myRowsParams = [...params, PAGE_SIZE, offset];
  const myRows = await pool.query<{
    battle_id: string;
    kind: 'public' | 'private';
    finished_at: Date | null;
    is_winner: boolean;
    peak_score: number;
    joined_at: Date;
    is_tie: boolean;
  }>(
    // is_tie = nobody on this battle has is_winner=true AND there are
    // at least 2 participants. Means the peak scores matched.
    `select b.id as battle_id, b.kind, b.finished_at,
            p.is_winner, p.peak_score, p.joined_at,
            (
              not exists (
                select 1 from battle_participants w
                 where w.battle_id = b.id and w.is_winner = true
              )
              and (
                select count(*) from battle_participants c where c.battle_id = b.id
              ) >= 2
            ) as is_tie
       from battle_participants p
       join battles b on b.id = p.battle_id
      where ${whereSql}
      order by b.finished_at desc nulls last, p.joined_at desc
      limit $${i} offset $${i + 1}`,
    myRowsParams,
  );

  // 2) Summary over the full filtered set (not just this page). Cheap
  // when the set is small; for large histories this is still a single
  // count query so well-indexed.
  const summaryResult = await pool.query<{
    total: number;
    won: number;
    peak: number | null;
  }>(
    `select count(*)::int as total,
            count(*) filter (where p.is_winner)::int as won,
            max(p.peak_score)::int as peak
       from battle_participants p
       join battles b on b.id = p.battle_id
      where ${whereSql}`,
    params,
  );
  const summaryRow = summaryResult.rows[0] ?? { total: 0, won: 0, peak: null };
  const summary = {
    total: summaryRow.total,
    won: summaryRow.won,
    lost: summaryRow.total - summaryRow.won,
    win_rate:
      summaryRow.total > 0
        ? Math.round((summaryRow.won / summaryRow.total) * 100)
        : null,
    peak: summaryRow.peak,
  };

  if (myRows.rows.length === 0) {
    return NextResponse.json({
      entries: [],
      hasMore: false,
      page,
      summary,
    });
  }

  // 3) Opponent snapshots for the page's battles, batched.
  // user_id is selected for the WHERE filter (exclude self) but NOT
  // surfaced in the response — clients link via display_name.
  const battleIds = myRows.rows.map((r) => r.battle_id);
  const opponents = await pool.query<{
    battle_id: string;
    display_name: string;
    peak_score: number;
  }>(
    `select battle_id, display_name, peak_score
       from battle_participants
      where battle_id = any($1::uuid[]) and user_id <> $2`,
    [battleIds, user.id],
  );

  const oppByBattle = new Map<
    string,
    Array<{ display_name: string; peak_score: number }>
  >();
  for (const row of opponents.rows) {
    const list = oppByBattle.get(row.battle_id) ?? [];
    list.push({
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
    is_tie: r.is_tie,
    peak_score: r.peak_score,
    opponents: oppByBattle.get(r.battle_id) ?? [],
  }));

  return NextResponse.json({
    entries,
    hasMore: entries.length === PAGE_SIZE,
    page,
    summary,
  });
}
