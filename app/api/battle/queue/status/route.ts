import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/battle/queue/status
 *
 * Polled by the matchmaking page while waiting for pair_two() to drop
 * the caller into a battle. Returns `{ paired: true, battle_id }` when
 * matched, `{ paired: false }` otherwise.
 *
 * Why polling: pair_two() runs inside a postgres function in another
 * caller's request, so the first-to-arrive client has no direct
 * signal that it's been paired. The Supabase Realtime
 * postgres_changes subscription would be cleaner but is blocked by
 * RLS (auth.uid() based; Auth.js sessions don't propagate). 1.5s
 * poll on the lobby is cheap.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query<{
    battle_id: string;
    state: string;
    started_at: Date | null;
  }>(
    `select bp.battle_id, b.state, b.started_at
       from battle_participants bp
       join battles b on b.id = bp.battle_id
      where bp.user_id = $1
        and b.kind = 'public'
        and b.state in ('lobby', 'starting', 'active')
        and bp.joined_at > now() - interval '5 minutes'
      order by bp.joined_at desc
      limit 1`,
    [user.id],
  );

  if (rows.length === 0) {
    return NextResponse.json({ paired: false });
  }
  return NextResponse.json({
    paired: true,
    battle_id: rows[0].battle_id,
    state: rows[0].state,
    started_at: rows[0].started_at ? rows[0].started_at.toISOString() : null,
  });
}
