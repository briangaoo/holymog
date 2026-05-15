import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/battle/[id]/participants
 *
 * Returns the participant list (user_id + display_name) for clients
 * polling the lobby. Auth required; caller must be the host or already
 * be a participant. Exists for the same reason as /state — Supabase
 * REST with the anon key is blocked by RLS (auth.uid() based, doesn't
 * match Auth.js sessions).
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

  const allowedResult = await pool.query<{
    allowed: boolean;
    state: string;
    started_at: Date | null;
  }>(
    `select (
       b.host_user_id = $2 or
       exists(
         select 1 from battle_participants p
          where p.battle_id = b.id and p.user_id = $2
       )
     ) as allowed,
     b.state,
     b.started_at
       from battles b
      where b.id = $1
      limit 1`,
    [id, user.id],
  );
  if (allowedResult.rows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!allowedResult.rows[0].allowed) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }

  const { rows } = await pool.query<{
    user_id: string;
    display_name: string;
  }>(
    `select user_id, display_name
       from battle_participants
      where battle_id = $1
      order by joined_at asc`,
    [id],
  );

  // Return state + started_at alongside participants so the lobby poll
  // can detect a host's /api/battle/start without depending on the
  // Supabase Realtime broadcast — broadcasts have proven flaky on
  // this project (same pattern as the Storage outage). The poll is the
  // reliable fallback path.
  return NextResponse.json({
    participants: rows,
    state: allowedResult.rows[0].state,
    started_at: allowedResult.rows[0].started_at
      ? allowedResult.rows[0].started_at.toISOString()
      : null,
  });
}
