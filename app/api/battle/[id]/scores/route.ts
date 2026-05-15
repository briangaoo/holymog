import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ScoresRow = {
  state: string;
  started_at: Date | null;
  finished_at: Date | null;
  is_participant: boolean;
};

/**
 * GET /api/battle/[id]/scores
 *
 * Polling fallback for live battle state + per-participant peak scores.
 * BattleRoom subscribes to Supabase Realtime broadcasts (`score.update`,
 * `battle.finished`) for the fast path, but Realtime delivery has been
 * unreliable on this project — both the matchmaking transition and
 * the lobby's start transition already needed polling fallbacks for the
 * same reason. This is the equivalent for the active battle phase:
 *
 *   - UI gets peak_score updates even when broadcasts drop.
 *   - finished_at landing here lets the BattleRoom kick its local
 *     /api/battle/finish call without waiting for the missed broadcast.
 *
 * Auth required; caller must be a participant in the battle. We don't
 * leak per-participant scores to non-participants — battle scores are
 * only meaningful inside the live room and exposing them by id would
 * undercut the "no permanent score record beyond the result screen"
 * privacy posture.
 *
 * Returns peak_score per participant, NOT the latest momentary overall —
 * /api/battle/score never persists the live score, only the running
 * peak. That's enough to drive both the score card and the peak readout
 * once broadcasts have dropped; the bouncing live number degrades
 * gracefully to "stuck at peak until next broadcast" rather than
 * disappearing entirely.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  const pool = getPool();

  const battleResult = await pool.query<ScoresRow>(
    `select b.state, b.started_at, b.finished_at,
            exists(
              select 1 from battle_participants p
               where p.battle_id = b.id and p.user_id = $2
            ) as is_participant
       from battles b
      where b.id = $1
      limit 1`,
    [id, user.id],
  );
  if (battleResult.rows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const battle = battleResult.rows[0];
  if (!battle.is_participant) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }

  const participants = await pool.query<{
    user_id: string;
    peak_score: number;
  }>(
    `select user_id, peak_score
       from battle_participants
      where battle_id = $1
      order by joined_at asc`,
    [id],
  );

  return NextResponse.json({
    state: battle.state,
    started_at: battle.started_at ? battle.started_at.toISOString() : null,
    finished_at: battle.finished_at ? battle.finished_at.toISOString() : null,
    participants: participants.rows.map((r) => ({
      user_id: r.user_id,
      peak_score: r.peak_score,
    })),
  });
}
