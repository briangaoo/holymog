import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/battle/[id]/state
 *
 * Returns battle metadata (state, kind, started_at) for clients. Auth
 * required; caller must be the host or a participant. This exists
 * because the Supabase REST + anon-key path is blocked by RLS — our
 * RLS policies use `auth.uid()` which the Next.js client (using
 * Auth.js, not Supabase Auth) can't satisfy. Routing reads through a
 * backend route lets us use the service-role pool and apply the same
 * "participant or host" check ourselves.
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
  const result = await pool.query<{
    id: string;
    kind: string;
    state: string;
    host_user_id: string | null;
    started_at: Date | null;
    is_participant: boolean;
    rematch_battle_id: string | null;
    rematch_code: string | null;
  }>(
    // LEFT JOIN on the rematch row so the result-screen poll can detect
    // when this battle has been rematched and follow the host into the
    // new lobby — even when the `battle.rematch` Realtime broadcast
    // drops. Cheap (single indexed lookup via rematch_battle_id FK).
    `select b.id, b.kind, b.state, b.host_user_id, b.started_at,
            b.rematch_battle_id,
            r.code as rematch_code,
            exists(
              select 1 from battle_participants p
               where p.battle_id = b.id and p.user_id = $2
            ) as is_participant
       from battles b
       left join battles r on r.id = b.rematch_battle_id
      where b.id = $1
      limit 1`,
    [id, user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const b = result.rows[0];
  if (b.host_user_id !== user.id && !b.is_participant) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }
  return NextResponse.json({
    id: b.id,
    kind: b.kind,
    state: b.state,
    started_at: b.started_at ? b.started_at.toISOString() : null,
    host_user_id: b.host_user_id,
    rematch_battle_id: b.rematch_battle_id,
    rematch_code: b.rematch_code,
  });
}
