import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { broadcastBattleEvent } from '@/lib/realtime';
import { computeElo } from '@/lib/elo';
import {
  checkAchievements,
  type AchievementGrant,
} from '@/lib/achievements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { battle_id?: unknown };

type ParticipantRow = {
  user_id: string;
  display_name: string;
  peak_score: number;
  joined_at: Date;
};

type BattleRow = {
  state: string;
  kind: 'public' | 'private';
  started_at: Date | null;
  finished_at: Date | null;
};

type ProfileRow = {
  user_id: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
};

type EloChange = {
  user_id: string;
  before: number;
  after: number;
  delta: number;
};

type ResultParticipant = {
  user_id: string;
  display_name: string;
  final_score: number;
  is_winner: boolean;
};

/**
 * POST /api/battle/finish
 *
 * Idempotent finalisation. Triggered by whichever participant's
 * countdown hits 0 first; subsequent callers receive the cached
 * result (with ELO deltas if applicable).
 *
 * Steps:
 *   1. Assert state is 'active' or 'starting' AND >= 10s past
 *      started_at.
 *   2. Sort participants by peak_score desc, joined_at asc.
 *      First row wins; ties broken by earlier joiner.
 *   3. Mark winner, set final_score = peak_score for everyone.
 *   4. If kind = 'public' AND exactly 2 participants: compute ELO
 *      updates and apply to both profiles atomically. Stamp the
 *      delta + new ELO into the result payload.
 *   5. Update battle state to 'finished', stamp finished_at.
 *   6. Broadcast battle.finished over Realtime.
 *   7. (Phase 5: append to a battle_history table for the /account
 *       history tab. Out of scope for Phase 3.)
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
  const battleId = body.battle_id;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    // Assert participation + lock the row.
    const battleResult = await client.query<BattleRow>(
      `select b.state, b.kind, b.started_at, b.finished_at
         from battles b
         join battle_participants p on p.battle_id = b.id
        where b.id = $1 and p.user_id = $2
        limit 1
        for update`,
      [battleId, user.id],
    );
    if (battleResult.rows.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
    }
    const battle = battleResult.rows[0];

    if (battle.state === 'finished') {
      await client.query('rollback');
      return cachedResult(battleId);
    }

    if (battle.state !== 'active' && battle.state !== 'starting') {
      await client.query('rollback');
      return NextResponse.json(
        { error: 'unfinishable_state', state: battle.state },
        { status: 409 },
      );
    }

    if (battle.started_at) {
      const elapsedMs = Date.now() - battle.started_at.getTime();
      if (elapsedMs < 10_000) {
        await client.query('rollback');
        return NextResponse.json({ error: 'too_early' }, { status: 409 });
      }
    }

    // Pull participants ordered by peak desc, then earliest joiner.
    const participantsResult = await client.query<ParticipantRow>(
      `select user_id, display_name, peak_score, joined_at
         from battle_participants
        where battle_id = $1
        order by peak_score desc, joined_at asc`,
      [battleId],
    );
    const participants = participantsResult.rows;
    if (participants.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'no_participants' }, { status: 500 });
    }

    const winnerId = participants[0].user_id;

    // Stamp final_score for everyone, is_winner for the top.
    await client.query(
      `update battle_participants
          set final_score = peak_score,
              is_winner = (user_id = $2)
        where battle_id = $1`,
      [battleId, winnerId],
    );

    // ----- ELO updates (public 1v1 only) -----
    let eloChanges: EloChange[] = [];
    if (battle.kind === 'public' && participants.length === 2) {
      const loserId = participants[1].user_id;

      // Lock both profiles in stable order (lower user_id first) to avoid
      // deadlocks if two simultaneous public battles share users in
      // pathological cases.
      const orderedIds = [winnerId, loserId].sort();
      const profilesResult = await client.query<ProfileRow>(
        `select user_id, elo, peak_elo, matches_played, matches_won,
                current_streak, longest_streak
           from profiles
          where user_id = any($1::uuid[])
          for update`,
        [orderedIds],
      );

      const byId = new Map<string, ProfileRow>();
      for (const row of profilesResult.rows) byId.set(row.user_id, row);

      const winnerProfile = byId.get(winnerId);
      const loserProfile = byId.get(loserId);

      if (winnerProfile && loserProfile) {
        const elo = computeElo({
          winnerElo: winnerProfile.elo,
          winnerMatches: winnerProfile.matches_played,
          winnerScore: participants[0].peak_score,
          loserElo: loserProfile.elo,
          loserMatches: loserProfile.matches_played,
          loserScore: participants[1].peak_score,
        });

        // Winner: bump streak, peak_elo, matches_won.
        await client.query(
          `update profiles
              set elo = $1,
                  peak_elo = greatest(peak_elo, $1),
                  matches_played = matches_played + 1,
                  matches_won = matches_won + 1,
                  current_streak = current_streak + 1,
                  longest_streak = greatest(longest_streak, current_streak + 1)
            where user_id = $2`,
          [elo.newWinnerElo, winnerId],
        );

        // Loser: reset streak, no matches_won bump.
        await client.query(
          `update profiles
              set elo = $1,
                  peak_elo = greatest(peak_elo, $1),
                  matches_played = matches_played + 1,
                  current_streak = 0
            where user_id = $2`,
          [elo.newLoserElo, loserId],
        );

        eloChanges = [
          {
            user_id: winnerId,
            before: winnerProfile.elo,
            after: elo.newWinnerElo,
            delta: elo.winnerDelta,
          },
          {
            user_id: loserId,
            before: loserProfile.elo,
            after: elo.newLoserElo,
            delta: elo.loserDelta,
          },
        ];

        // Snapshot the post-battle ELO + delta + battle_id for both
        // players. The sparkline reads `elo`; the "biggest swings"
        // panel reads `delta` joined back to `battles` for opponent
        // attribution.
        await client.query(
          `insert into elo_history (user_id, elo, delta, battle_id)
             values ($1, $2, $3, $5), ($4, $6, $7, $5)`,
          [
            winnerId,
            elo.newWinnerElo,
            elo.winnerDelta,
            loserId,
            battleId,
            elo.newLoserElo,
            elo.loserDelta,
          ],
        );
      }
    }

    // Flip battle to finished.
    await client.query(
      `update battles
          set state = 'finished',
              finished_at = now()
        where id = $1`,
      [battleId],
    );

    await client.query('commit');

    // Build result payload + broadcast.
    const resultParticipants: ResultParticipant[] = participants.map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      final_score: p.peak_score,
      is_winner: p.user_id === winnerId,
    }));

    const payload = {
      battle_id: battleId,
      kind: battle.kind,
      winner_id: winnerId,
      participants: resultParticipants,
      elo_changes: eloChanges,
    };
    void broadcastBattleEvent(battleId, 'battle.finished', payload);

    // Achievement firing — only for the caller (we'll toast them
    // client-side). Other participants pick up grants on their next
    // request that fires through checkAchievements.
    let grants: AchievementGrant[] = [];
    try {
      const callerStats = await pool.query<{
        matches_won: number;
        elo: number;
        current_streak: number;
      }>(
        `select matches_won, elo, current_streak from profiles where user_id = $1 limit 1`,
        [user.id],
      );
      const s = callerStats.rows[0];
      if (s) {
        // currentWinStreak = current_streak (same field; consecutive wins).
        // eloGainedFromBase computed against the 1000 starting ELO.
        grants = await checkAchievements(user.id, {
          matchesWon: s.matches_won,
          elo: s.elo,
          eloGainedFromBase: s.elo - 1000,
          currentStreak: s.current_streak,
          currentWinStreak: s.current_streak,
        });
      }
    } catch {
      // Best-effort.
    }

    return NextResponse.json({ result: payload, achievements: grants });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'finalise_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/**
 * Re-build the result payload for a battle that's already been
 * finalised. Includes ELO changes if they're recoverable from the
 * profile rows (we don't store before-snapshots, so deltas are not
 * recomputable; clients that arrived after the original /finish
 * see the participants but an empty elo_changes array).
 */
async function cachedResult(battleId: string): Promise<Response> {
  const pool = getPool();
  const battleResult = await pool.query<{ kind: 'public' | 'private' }>(
    `select kind from battles where id = $1 limit 1`,
    [battleId],
  );
  const kind = battleResult.rows[0]?.kind ?? 'public';

  const result = await pool.query<{
    user_id: string;
    display_name: string;
    final_score: number | null;
    is_winner: boolean;
    peak_score: number;
  }>(
    `select user_id, display_name, final_score, is_winner, peak_score
       from battle_participants
      where battle_id = $1
      order by peak_score desc, joined_at asc`,
    [battleId],
  );
  const winner = result.rows.find((p) => p.is_winner);
  return NextResponse.json({
    result: {
      battle_id: battleId,
      kind,
      winner_id: winner?.user_id ?? null,
      participants: result.rows.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        final_score: p.final_score ?? p.peak_score,
        is_winner: p.is_winner,
      })),
      elo_changes: [],
    },
  });
}
