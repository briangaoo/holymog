import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { mintLiveKitToken } from '@/lib/livekit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/battle/[id]/token
 *
 * Issue a LiveKit access token for a battle the caller is in.
 * The token is bound to the battle's livekit_room and the caller's
 * user_id (as the LiveKit participant identity). 30-min TTL — the
 * battle itself is 10s but we leave generous headroom for
 * countdown + reveal.
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

  const { id: battleId } = await params;
  if (!battleId) {
    return NextResponse.json({ error: 'invalid_battle' }, { status: 400 });
  }

  const pool = getPool();

  // Confirm user is a participant in this battle and grab the room name.
  const result = await pool.query<{
    livekit_room: string;
    display_name: string;
  }>(
    `select b.livekit_room, p.display_name
       from battles b
       join battle_participants p on p.battle_id = b.id
      where b.id = $1 and p.user_id = $2
      limit 1`,
    [battleId, user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }

  const { livekit_room, display_name } = result.rows[0];

  try {
    const { token, url } = await mintLiveKitToken({
      room: livekit_room,
      userId: user.id,
      displayName: display_name,
    });
    return NextResponse.json({ token, url, room: livekit_room });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'token_mint_failed' },
      { status: 500 },
    );
  }
}
