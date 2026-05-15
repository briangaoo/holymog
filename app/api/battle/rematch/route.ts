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
 * Spins up (or returns the existing) private rematch for a finished
 * battle. Idempotent on the OLD battle id: two simultaneous callers
 * always end up in the SAME new battle.
 *
 * Without idempotency, each clicker creates their own battle, the
 * `battle.rematch` Realtime broadcasts cross in flight, and each player
 * ends up alone scoring 0 against a ghost. We make this safe with a
 * single-row FOR UPDATE lock on the old battle inside one transaction:
 * second caller waits, then sees `rematch_battle_id` is already set,
 * and returns the existing rematch instead of creating another one.
 *
 * Schema dependency: `battles.rematch_battle_id uuid REFERENCES
 * battles(id) ON DELETE SET NULL`. Apply via
 * docs/migrations/2026-05-14-rematch-idempotency.sql before this route
 * is hit; the existence-check coalesce protects the route from a brief
 * pre-migration window but persistent absence will throw.
 *
 * Guards:
 *   - Caller must be a participant of the old battle.
 *   - Old battle must be kind='private' (no public rematch — we don't
 *     want to let losers farm ELO with their preferred opponent).
 *   - Old battle must be in 'finished' state.
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
    await client.query('begin');

    // Lock the old battle row + check participation in one shot. The
    // FOR UPDATE on b is what serializes concurrent rematch calls;
    // joining battle_participants in the same statement uses the
    // existing index and doesn't widen the lock.
    const oldBattle = await client.query<{
      kind: string;
      state: string;
      rematch_battle_id: string | null;
      host_user_id: string | null;
    }>(
      // host_user_id is preserved into the rematch battle below — the
      // original host stays host across rematches regardless of who
      // clicked the button. Without this, a guest who happened to win
      // the rematch race would hijack the host slot, which means
      // they'd then be the only one allowed to click START on the
      // next round.
      `select b.kind, b.state, b.rematch_battle_id, b.host_user_id
         from battles b
         join battle_participants p on p.battle_id = b.id
        where b.id = $1 and p.user_id = $2
        limit 1
        for update of b`,
      [oldBattleId, user.id],
    );
    if (oldBattle.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
    }
    const oldRow = oldBattle.rows[0];
    if (oldRow.kind !== 'private') {
      await client.query('rollback');
      return NextResponse.json({ error: 'public_rematch_not_allowed' }, { status: 400 });
    }
    if (oldRow.state !== 'finished') {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'old_battle_not_finished', state: oldRow.state },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // Idempotent path: a rematch already exists. Return it.
    // ------------------------------------------------------------------
    if (oldRow.rematch_battle_id) {
      const existing = await client.query<{
        id: string;
        code: string;
        livekit_room: string;
        state: string;
      }>(
        `select id, code, livekit_room, state
           from battles
          where id = $1
          limit 1`,
        [oldRow.rematch_battle_id],
      );
      if (existing.rows.length > 0) {
        const ex = existing.rows[0];
        await client.query('commit');
        return NextResponse.json({
          battle_id: ex.id,
          code: ex.code,
          livekit_room: ex.livekit_room,
          host_user_id: oldRow.host_user_id,
          already_existed: true,
        });
      }
      // rematch_battle_id pointed at a deleted battle (ON DELETE SET
      // NULL) — fall through to create a new one. Defensive: clear the
      // dangling pointer so subsequent calls don't keep hitting this
      // branch.
      await client.query(
        `update battles set rematch_battle_id = null where id = $1`,
        [oldBattleId],
      );
    }

    // ------------------------------------------------------------------
    // Create path: this caller wins the lock first. Build the rematch.
    // ------------------------------------------------------------------
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
      await client.query('rollback');
      return NextResponse.json({ error: 'no_participants' }, { status: 500 });
    }

    // Generate code with collision retry. Savepoints isolate each
    // INSERT attempt without dropping the outer FOR UPDATE lock, so
    // concurrent rematch callers still serialize on the old battle.
    let newBattleId: string | null = null;
    let newCode: string | null = null;
    let livekitRoom: string | null = null;

    // Carry the original host through. Fall back to the caller only if
    // the old battle somehow has no host_user_id (shouldn't happen for
    // a private battle — the create route always sets it — but a
    // defensive default beats throwing on a stale row).
    const newHostUserId = oldRow.host_user_id ?? user.id;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateBattleCode();
      await client.query('savepoint try_insert');
      try {
        const inserted = await client.query<{
          id: string;
          livekit_room: string;
        }>(
          `insert into battles (kind, code, host_user_id, livekit_room, state)
             values ('private', $1, $2, $3, 'lobby')
             returning id, livekit_room`,
          [candidate, newHostUserId, `private-${candidate}`],
        );
        newBattleId = inserted.rows[0].id;
        newCode = candidate;
        livekitRoom = inserted.rows[0].livekit_room;
        await client.query('release savepoint try_insert');
        break;
      } catch (err) {
        await client.query('rollback to savepoint try_insert');
        const code = (err as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) continue;
        throw err;
      }
    }

    if (!newBattleId || !newCode || !livekitRoom) {
      await client.query('rollback');
      return NextResponse.json({ error: 'code_generation_failed' }, { status: 500 });
    }

    // Re-add every previous participant (the original host stays host;
    // see newHostUserId above).
    for (const p of participants.rows) {
      await client.query(
        `insert into battle_participants (battle_id, user_id, display_name)
           values ($1, $2, $3)`,
        [newBattleId, p.user_id, p.display_name],
      );
    }

    // Anchor the rematch on the old battle so subsequent calls see it.
    // This is the single source of truth idempotency depends on.
    await client.query(
      `update battles set rematch_battle_id = $1 where id = $2`,
      [newBattleId, oldBattleId],
    );

    await client.query('commit');

    // Tell anyone still on the old result screen to follow into the
    // new lobby. Realtime is the fast path; the result screen also
    // polls /api/battle/[id]/state for the rematch_battle_id as the
    // reliable backup when broadcasts drop. host_user_id rides with
    // the broadcast so receivers can compute isHost correctly without
    // a separate fetch.
    void broadcastBattleEvent(oldBattleId, 'battle.rematch', {
      old_battle_id: oldBattleId,
      new_battle_id: newBattleId,
      new_code: newCode,
      host_user_id: newHostUserId,
    });

    return NextResponse.json({
      battle_id: newBattleId,
      code: newCode,
      livekit_room: livekitRoom,
      host_user_id: newHostUserId,
    });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'rematch_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
