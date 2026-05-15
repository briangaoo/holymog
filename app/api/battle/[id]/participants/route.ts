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

  // Join users (for the avatar) + profiles (for cosmetics + the
  // userStats fields that smart name/frame fx consume). Without this
  // the lobby renders every participant as a generic letter-fallback
  // avatar even though they have a profile picture + decorations
  // equipped — which is what they actually look like everywhere else
  // in the product. Same shape the BattleRoom gets through the
  // LiveKit token metadata, so the lobby → in-battle transition is
  // visually continuous.
  const { rows } = await pool.query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    equipped_frame: string | null;
    equipped_flair: string | null;
    equipped_name_fx: string | null;
    elo: number | null;
    current_streak: number | null;
    matches_won: number | null;
    best_scan_overall: number | null;
    subscription_status: string | null;
  }>(
    // left_at IS NULL filters out participants who have auto-left
    // (closed the tab, navigated away, or clicked LEAVE). Without
    // this a guest who's wandered off to the homepage still shows in
    // the lobby + still counts toward min-2-to-start. The re-join
    // path (POST /join with the same code) clears left_at back to
    // NULL so honest returns are not penalised.
    `select bp.user_id, bp.display_name,
            u.image as avatar_url,
            p.equipped_frame, p.equipped_flair, p.equipped_name_fx,
            p.elo, p.current_streak, p.matches_won,
            p.best_scan_overall, p.subscription_status
       from battle_participants bp
       left join users u on u.id = bp.user_id
       left join profiles p on p.user_id = bp.user_id
      where bp.battle_id = $1
        and bp.left_at is null
      order by bp.joined_at asc`,
    [id],
  );

  // Return state + started_at alongside participants so the lobby poll
  // can detect a host's /api/battle/start without depending on the
  // Supabase Realtime broadcast — broadcasts have proven flaky on
  // this project (same pattern as the Storage outage). The poll is the
  // reliable fallback path.
  return NextResponse.json({
    participants: rows.map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      equipped_frame: r.equipped_frame,
      equipped_flair: r.equipped_flair,
      equipped_name_fx: r.equipped_name_fx,
      elo: r.elo,
      current_streak: r.current_streak,
      matches_won: r.matches_won,
      best_scan_overall: r.best_scan_overall,
      is_subscriber:
        r.subscription_status === 'active' ||
        r.subscription_status === 'trialing',
    })),
    state: allowedResult.rows[0].state,
    started_at: allowedResult.rows[0].started_at
      ? allowedResult.rows[0].started_at.toISOString()
      : null,
  });
}
