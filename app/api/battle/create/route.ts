import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { generateBattleCode } from '@/lib/battle-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CODE_ATTEMPTS = 5;
// Postgres unique-violation code surfaced by pg
const UNIQUE_VIOLATION = '23505';

/**
 * POST /api/battle/create
 *
 * Host creates a private battle. Generates a 6-char Crockford code
 * (retrying on the vanishingly rare collision), inserts the battles
 * row in 'lobby' state with the host's user_id, and inserts the host
 * as the first participant. Returns the battle_id + code so the host
 * can share it with friends.
 */
export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Pull host display_name to denormalise into the participant row.
    const profileResult = await client.query<{ display_name: string }>(
      'select display_name from profiles where user_id = $1 limit 1',
      [user.id],
    );
    const displayName = profileResult.rows[0]?.display_name ?? 'host';

    let battleId: string | null = null;
    let code: string | null = null;
    let livekitRoom: string | null = null;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateBattleCode();
      try {
        await client.query('begin');

        const result = await client.query<{
          id: string;
          livekit_room: string;
        }>(
          `insert into battles (kind, code, host_user_id, livekit_room, state)
             values ('private', $1, $2, $3, 'lobby')
             returning id, livekit_room`,
          [candidate, user.id, `private-${candidate}`],
        );
        battleId = result.rows[0].id;
        code = candidate;
        livekitRoom = result.rows[0].livekit_room;

        await client.query(
          `insert into battle_participants (battle_id, user_id, display_name)
             values ($1, $2, $3)`,
          [battleId, user.id, displayName],
        );

        await client.query('commit');
        break;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        const code = (err as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) {
          // Code collision; try again with a fresh code.
          continue;
        }
        throw err;
      }
    }

    if (!battleId || !code || !livekitRoom) {
      return NextResponse.json(
        { error: 'code_generation_failed' },
        { status: 500 },
      );
    }

    return NextResponse.json({ battle_id: battleId, code, livekit_room: livekitRoom });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'create_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
