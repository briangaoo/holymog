import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { mintLiveKitToken } from '@/lib/livekit';
import { weakestSubScore } from '@/lib/scoreEngine';
import type { SubScores } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/battle/[id]/token
 *
 * Issue a LiveKit access token for a battle the caller is in.
 * The token is bound to the battle's livekit_room and the caller's
 * user_id (as the LiveKit participant identity). 30-min TTL.
 *
 * The token metadata carries the participant's cosmetic state +
 * userStats so battle tiles can render smart cosmetics correctly
 * without an additional DB round-trip per opponent.
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

  // Confirm user is a participant + pull every field we need to embed
  // in the LiveKit metadata.
  const result = await pool.query<{
    livekit_room: string;
    state: string;
    display_name: string;
    image: string | null;
    equipped_frame: string | null;
    equipped_flair: string | null;
    equipped_name_fx: string | null;
    elo: number | null;
    current_streak: number | null;
    best_scan_overall: number | null;
    matches_won: number | null;
    best_scan: unknown | null;
    subscription_status: string | null;
  }>(
    `select b.livekit_room, b.state, p.display_name, u.image,
            pp.equipped_frame, pp.equipped_flair, pp.equipped_name_fx,
            pp.elo, pp.current_streak, pp.best_scan_overall, pp.matches_won,
            pp.best_scan, pp.subscription_status
       from battles b
       join battle_participants p on p.battle_id = b.id
       join users u on u.id = p.user_id
       left join profiles pp on pp.user_id = u.id
      where b.id = $1 and p.user_id = $2
      limit 1`,
    [battleId, user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }

  const row = result.rows[0];
  const { livekit_room, state } = row;

  if (state !== 'lobby' && state !== 'starting' && state !== 'active') {
    return NextResponse.json(
      { error: 'battle_not_active', state },
      { status: 409 },
    );
  }

  // Derive weakest sub-score from the user's best scan, when available.
  let weakest: keyof SubScores | null = null;
  if (row.best_scan && typeof row.best_scan === 'object') {
    const bs = row.best_scan as { scores?: { sub?: SubScores } };
    if (bs.scores?.sub) {
      weakest = weakestSubScore({ overall: 0, sub: bs.scores.sub });
    }
  }

  const isSubscriber =
    row.subscription_status === 'active' || row.subscription_status === 'trialing';

  try {
    const { token, url } = await mintLiveKitToken({
      room: livekit_room,
      userId: user.id,
      displayName: row.display_name,
      avatarUrl: row.image ?? undefined,
      equippedFrame: row.equipped_frame,
      equippedFlair: row.equipped_flair,
      equippedNameFx: row.equipped_name_fx,
      elo: row.elo,
      currentStreak: row.current_streak,
      bestScanOverall: row.best_scan_overall,
      matchesWon: row.matches_won,
      weakestSubScore: weakest,
      isSubscriber,
    });
    return NextResponse.json({ token, url, room: livekit_room });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'token_mint_failed' },
      { status: 500 },
    );
  }
}
