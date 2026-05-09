import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { generateBattleCode } from '@/lib/battle-code';
import { broadcastBattleEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

type Body = { battle_id?: unknown };

/**
 * POST /api/battle/rematch
 *
 * Spins up a fresh private battle with the same participants as the
 * supplied (finished, kind='private') battle. Returns the new
 * battle_id + code, and broadcasts `battle.rematch` on the OLD
 * battle's channel so any client still on the old result screen
 * follows the host into the new lobby.
 *
 * Guards:
 *   - Caller must be a participant of the old battle.
 *   - Old battle must be kind='private' (no public rematch — we don't
 *     want to let losers farm ELO with their preferred opponent).
 *   - Old battle must be in 'finished' state.
 *
 * Race: two participants clicking simultaneously could create two
 * new battles. We accept that — the duplicate just sits empty and
 * times out. The broadcast carries `new_battle_id` so the second
 * clicker's UI also navigates; the orphan lobby is harmless.
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
  const oldBattleId = body.battle_id;

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Validate the old battle and confirm caller is a participant.
    const oldBattle = await client.query<{
      kind: string;
      state: string;
    }>(
      `select b.kind, b.state
         from battles b
         join battle_participants p on p.battle_id = b.id
        where b.id = $1 and p.user_id = $2
        limit 1`,
      [oldBattleId, user.id],
    );
    if (oldBattle.rows.length === 0) {
      return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
    }
    if (oldBattle.rows[0].kind !== 'private') {
      return NextResponse.json({ error: 'public_rematch_not_allowed' }, { status: 400 });
    }
    if (oldBattle.rows[0].state !== 'finished') {
      return NextResponse.json(
        { error: 'old_battle_not_finished', state: oldBattle.rows[0].state },
        { status: 409 },
      );
    }

    // Pull the original participants list (for re-seeding the new battle).
    const participants = await client.query<{
      user_id: string;
      display_name: string;
    }>(
      `select user_id, display_name
         from battle_participants
        where battle_id = $1
        order by joined_at asc`,
      [oldBattleId],
    );
    if (participants.rows.length === 0) {
      return NextResponse.json({ error: 'no_participants' }, { status: 500 });
    }

    // Create new battle with a fresh Crockford code, retrying on collision.
    let newBattleId: string | null = null;
    let newCode: string | null = null;
    let livekitRoom: string | null = null;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateBattleCode();
      try {
        await client.query('begin');
        const inserted = await client.query<{
          id: string;
          livekit_room: string;
        }>(
          `insert into battles (kind, code, host_user_id, livekit_room, state)
             values ('private', $1, $2, $3, 'lobby')
             returning id, livekit_room`,
          [candidate, user.id, `private-${candidate}`],
        );
        newBattleId = inserted.rows[0].id;
        newCode = candidate;
        livekitRoom = inserted.rows[0].livekit_room;

        // Re-add every previous participant (including the caller — who is
        // now the host of the new battle).
        for (const p of participants.rows) {
          await client.query(
            `insert into battle_participants (battle_id, user_id, display_name)
               values ($1, $2, $3)`,
            [newBattleId, p.user_id, p.display_name],
          );
        }

        await client.query('commit');
        break;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        const code = (err as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) continue;
        throw err;
      }
    }

    if (!newBattleId || !newCode || !livekitRoom) {
      return NextResponse.json({ error: 'code_generation_failed' }, { status: 500 });
    }

    // Tell anyone still on the old result screen to follow into the new lobby.
    void broadcastBattleEvent(oldBattleId, 'battle.rematch', {
      old_battle_id: oldBattleId,
      new_battle_id: newBattleId,
      new_code: newCode,
    });

    return NextResponse.json({
      battle_id: newBattleId,
      code: newCode,
      livekit_room: livekitRoom,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'rematch_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
