import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { broadcastBattleEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { battle_id?: unknown };

type ParticipantRow = {
  user_id: string;
  display_name: string;
  peak_score: number;
  joined_at: Date;
};

type BattleRow = {
  state: string;
  started_at: Date | null;
  finished_at: Date | null;
};

/**
 * POST /api/battle/finish
 *
 * Idempotent finalisation. Triggered by whichever participant's
 * countdown hits 0 first; subsequent callers receive the cached
 * result without re-running the logic.
 *
 * 1. Asserts state is 'active' or 'starting' AND >= 10s past
 *    started_at (so we're past the active window).
 * 2. Sorts participants by peak_score desc, joined_at asc.
 *    First row wins; ties broken by earlier joiner.
 * 3. Marks winner, sets final_score = peak_score for everyone.
 * 4. Updates battle state to 'finished', stamps finished_at.
 * 5. Broadcasts battle.finished over Realtime with full result.
 *
 * (Phase 3 will add: ELO + match counter updates here.)
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.battle_id !== 'string') {
    return NextResponse.json({ error: 'missing_battle_id' }, { status: 400 });
  }
  const battleId = body.battle_id;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    // Assert participation + lock the row.
    const battleResult = await client.query<BattleRow>(
      `select b.state, b.started_at, b.finished_at
         from battles b
         join battle_participants p on p.battle_id = b.id
        where b.id = $1 and p.user_id = $2
        limit 1
        for update`,
      [battleId, user.id],
    );
    if (battleResult.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
    }
    const battle = battleResult.rows[0];

    // If already finished, just return the cached result.
    if (battle.state === 'finished') {
      await client.query('rollback');
      return cachedResult(battleId);
    }

    if (battle.state !== 'active' && battle.state !== 'starting') {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'unfinishable_state', state: battle.state },
        { status: 409 },
      );
    }

    // Must be past the 10-second active window.
    if (battle.started_at) {
      const elapsedMs = Date.now() - battle.started_at.getTime();
      if (elapsedMs < 10_000) {
        await client.query('rollback');
        return NextResponse.json({ error: 'too_early' }, { status: 409 });
      }
    }

    // Pull all participants ordered by peak desc, then earliest joiner.
    const participantsResult = await client.query<ParticipantRow>(
      `select user_id, display_name, peak_score, joined_at
         from battle_participants
        where battle_id = $1
        order by peak_score desc, joined_at asc`,
      [battleId],
    );
    const participants = participantsResult.rows;
    if (participants.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'no_participants' }, { status: 500 });
    }

    const winnerId = participants[0].user_id;

    // Stamp final_score for everyone, is_winner for the top.
    await client.query(
      `update battle_participants
          set final_score = peak_score,
              is_winner = (user_id = $2)
        where battle_id = $1`,
      [battleId, winnerId],
    );

    // Flip battle to finished.
    await client.query(
      `update battles
          set state = 'finished',
              finished_at = now()
        where id = $1`,
      [battleId],
    );

    await client.query('commit');

    // Build result payload + broadcast.
    const payload = {
      battle_id: battleId,
      winner_id: winnerId,
      participants: participants.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        final_score: p.peak_score,
        is_winner: p.user_id === winnerId,
      })),
    };
    void broadcastBattleEvent(battleId, 'battle.finished', payload);

    return NextResponse.json({ result: payload });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'finalise_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/**
 * Re-build the result payload for a battle that's already been
 * finalised. Called when a slow client posts /finish after the
 * winning client already did.
 */
async function cachedResult(battleId: string): Promise<Response> {
  const pool = getPool();
  const result = await pool.query<{
    user_id: string;
    display_name: string;
    final_score: number | null;
    is_winner: boolean;
    peak_score: number;
  }>(
    `select user_id, display_name, final_score, is_winner, peak_score
       from battle_participants
      where battle_id = $1
      order by peak_score desc, joined_at asc`,
    [battleId],
  );
  const winner = result.rows.find((p) => p.is_winner);
  return NextResponse.json({
    result: {
      battle_id: battleId,
      winner_id: winner?.user_id ?? null,
      participants: result.rows.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        final_score: p.final_score ?? p.peak_score,
        is_winner: p.is_winner,
      })),
    },
  });
}
