import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isValidBattleCode, normaliseBattleCode } from '@/lib/battle-code';
import { broadcastBattleEvent } from '@/lib/realtime';
import { getRatelimit } from '@/lib/ratelimit';
import { readClientIp } from '@/lib/scanLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { code?: unknown };

/**
 * POST /api/battle/join
 *
 * Joiner enters a private battle by code. Looks up the battle (must
 * be kind='private', state='lobby'), enforces max_participants,
 * inserts the joiner as a participant, broadcasts participant.joined
 * so the host's lobby UI updates in real time.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Block code-enumeration: 32^6 codes total, plenty of headroom past
  // legitimate use, but tight enough that brute-force is infeasible.
  // Keyed by user.id and IP both — a single user can't burn the bucket
  // with multiple IPs, and a botnet can't share one user.
  const limiter = getRatelimit('battleJoin');
  if (limiter) {
    const result = await limiter.limit(`${user.id}:${readClientIp(request)}`);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const rawCode = typeof body.code === 'string' ? body.code : '';
  const code = normaliseBattleCode(rawCode);
  if (!isValidBattleCode(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const battleResult = await client.query<{
      id: string;
      livekit_room: string;
      state: string;
      max_participants: number;
      participant_count: number;
    }>(
      `select b.id, b.livekit_room, b.state, b.max_participants,
              (select count(*)::int from battle_participants p where p.battle_id = b.id) as participant_count
         from battles b
        where b.code = $1 and b.kind = 'private'
        for update`,
      [code],
    );

    if (battleResult.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'code_not_found' }, { status: 404 });
    }

    const battle = battleResult.rows[0];

    if (battle.state !== 'lobby') {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'battle_already_started', state: battle.state },
        { status: 409 },
      );
    }

    if (battle.participant_count >= battle.max_participants) {
      await client.query('rollback');
      return NextResponse.json({ error: 'battle_full' }, { status: 409 });
    }

    // Idempotent: if already a participant, just return success.
    const existing = await client.query<{ id: string }>(
      `select id from battle_participants
        where battle_id = $1 and user_id = $2
        limit 1`,
      [battle.id, user.id],
    );

    if (existing.rows.length > 0) {
      await client.query('commit');
      return NextResponse.json({
        battle_id: battle.id,
        livekit_room: battle.livekit_room,
        already_in: true,
      });
    }

    const profileResult = await client.query<{ display_name: string }>(
      'select display_name from profiles where user_id = $1 limit 1',
      [user.id],
    );
    const displayName = profileResult.rows[0]?.display_name ?? 'player';

    await client.query(
      `insert into battle_participants (battle_id, user_id, display_name)
         values ($1, $2, $3)`,
      [battle.id, user.id, displayName],
    );

    await client.query('commit');

    void broadcastBattleEvent(battle.id, 'participant.joined', {
      user_id: user.id,
      display_name: displayName,
    });

    return NextResponse.json({
      battle_id: battle.id,
      livekit_room: battle.livekit_room,
    });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'join_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
