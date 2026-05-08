import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { broadcastBattleEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { battle_id?: unknown };

/**
 * POST /api/battle/leave
 *
 * Marks the participant as left. Called by the client on tab-close
 * (via navigator.sendBeacon) and explicit "leave battle" actions.
 * Idempotent — re-calls just refresh left_at.
 *
 * Broadcasts participant.left so other clients can dim the tile.
 * Doesn't change battle state — finalisation handles "what happens
 * if a participant has no scores" via simply ranking them last.
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
  const result = await pool.query(
    `update battle_participants
        set left_at = now()
      where battle_id = $1 and user_id = $2 and left_at is null
      returning user_id`,
    [battleId, user.id],
  );

  if ((result.rowCount ?? 0) > 0) {
    void broadcastBattleEvent(battleId, 'participant.left', {
      user_id: user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
