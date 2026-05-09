import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { broadcastBattleEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_PARTICIPANTS = 2;
const COUNTDOWN_MS = 3000;

type Body = { battle_id?: unknown };

/**
 * POST /api/battle/start
 *
 * Host-only. Flips a private battle from 'lobby' to 'starting' with
 * started_at = now() + 3s. All participants subscribed to the battles
 * row see the state change via Postgres realtime and transition into
 * the BattleRoom UI; their local countdown reads started_at.
 *
 * Guards:
 *   - Caller must be the battle's host_user_id
 *   - Battle must currently be in 'lobby'
 *   - Must have >= 2 participants
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

    const battleResult = await client.query<{
      kind: string;
      state: string;
      host_user_id: string | null;
      participant_count: number;
    }>(
      `select b.kind, b.state, b.host_user_id,
              (select count(*)::int from battle_participants p where p.battle_id = b.id) as participant_count
         from battles b
        where b.id = $1
        for update`,
      [battleId],
    );

    if (battleResult.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const battle = battleResult.rows[0];

    if (battle.kind !== 'private') {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_a_private_battle' }, { status: 400 });
    }
    if (battle.host_user_id !== user.id) {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_host' }, { status: 403 });
    }
    if (battle.state !== 'lobby') {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'unstartable_state', state: battle.state },
        { status: 409 },
      );
    }
    if (battle.participant_count < MIN_PARTICIPANTS) {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'not_enough_participants', count: battle.participant_count },
        { status: 409 },
      );
    }

    const startedAt = new Date(Date.now() + COUNTDOWN_MS);

    await client.query(
      `update battles
          set state = 'starting',
              started_at = $1
        where id = $2`,
      [startedAt, battleId],
    );

    await client.query('commit');

    void broadcastBattleEvent(battleId, 'battle.starting', {
      battle_id: battleId,
      started_at: startedAt.toISOString(),
    });

    return NextResponse.json({
      ok: true,
      started_at: startedAt.toISOString(),
    });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'start_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
