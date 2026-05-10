import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import {
  checkAchievements,
  type AchievementGrant,
} from '@/lib/achievements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/battle/queue
 *
 * Enter the public-1v1 matchmaking queue. Inserts into
 * matchmaking_queue, then immediately calls pair_two() — the
 * Postgres function that atomically pairs the two oldest waiting
 * users into a fresh battle.
 *
 * If pair_two() returns a battle_id, this caller was matched
 * (either with someone who was already waiting, or with another
 * caller who joined nanoseconds earlier and got their pair_two
 * call in first). Either way, the client gets the battle_id back
 * and can proceed to fetch a LiveKit token.
 *
 * If pair_two() returns null, the caller's queue entry is
 * persisted; they'll be matched on someone else's pair_two() call
 * shortly. The client subscribes to a Supabase Realtime channel
 * filtered to battle_participants where user_id = auth.uid() to
 * pick up the eventual pairing.
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
    // Pull display_name from profiles so the queue + battle_participants
    // rows have the user-facing label denormalised.
    const profileResult = await client.query<{ display_name: string }>(
      'select display_name from profiles where user_id = $1 limit 1',
      [user.id],
    );
    const displayName = profileResult.rows[0]?.display_name ?? 'player';

    // Upsert the queue entry. ON CONFLICT keeps an existing entry
    // alive (refreshing nothing) so re-clicks don't multiply.
    await client.query(
      `insert into matchmaking_queue (user_id, display_name)
         values ($1, $2)
         on conflict (user_id) do nothing`,
      [user.id, displayName],
    );

    // Try to pair. pair_two() returns the battle_id if it found a
    // pair, otherwise null.
    const pairResult = await client.query<{ battle_id: string | null }>(
      'select pair_two() as battle_id',
    );
    const battleId = pairResult.rows[0]?.battle_id ?? null;

    // Achievement firing — first queue grants `theme.match-found`.
    let grants: AchievementGrant[] = [];
    try {
      grants = await checkAchievements(user.id, { battleQueued: true });
    } catch {
      // Best-effort.
    }

    if (battleId) {
      return NextResponse.json({
        battle_id: battleId,
        paired: true,
        achievements: grants,
      });
    }
    return NextResponse.json({ queued: true, achievements: grants });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'queue_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/battle/queue
 *
 * Cancel the user's queue entry (e.g. they tapped cancel before
 * being matched). Idempotent.
 */
export async function DELETE() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  await pool.query('delete from matchmaking_queue where user_id = $1', [user.id]);
  return NextResponse.json({ ok: true });
}
