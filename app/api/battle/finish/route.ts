import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { broadcastBattleEvent } from '@/lib/realtime';
import { computeElo, computeEloTie } from '@/lib/elo';
import {
  checkAchievements,
  type AchievementGrant,
} from '@/lib/achievements';
import { recordAudit } from '@/lib/audit';
import { weakestSubScore } from '@/lib/scoreEngine';
import type { SubScores } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { battle_id?: unknown };

type ParticipantRow = {
  user_id: string;
  display_name: string;
  peak_score: number;
  joined_at: Date;
  // Cosmetic + stats fields needed to render the result screen's
  // headline + player cards through <NameFx /> so the opponent's
  // equipped name effect shows in "you cooked @opponent." instead
  // of plain text. Joined from profiles via the query below.
  equipped_name_fx: string | null;
  elo: number;
  current_streak: number;
  matches_won: number;
  best_scan_overall: number | null;
  best_scan: unknown | null;
  subscription_status: string | null;
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
  is_tie: boolean;
  /** Equipped name effect slug — drives <NameFx> on the result
   *  screen so opponents render with their actual treatment. */
  equipped_name_fx: string | null;
  /** UserStats fields for smart name-fx (tier-prefix, callout,
   *  streak-flame, elo-king, score-overlay). All optional so the
   *  client falls back gracefully when missing. */
  elo: number | null;
  current_streak: number | null;
  matches_won: number | null;
  best_scan_overall: number | null;
  weakest_sub_score: keyof SubScores | null;
  is_subscriber: boolean;
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
    // JOIN profiles so the result payload carries the equipped name
    // fx + userStats fields the result-screen <NameFx /> needs.
    const participantsResult = await client.query<ParticipantRow>(
      `select bp.user_id, bp.display_name, bp.peak_score, bp.joined_at,
              pp.equipped_name_fx, pp.elo, pp.current_streak,
              pp.matches_won, pp.best_scan_overall, pp.best_scan,
              pp.subscription_status
         from battle_participants bp
         join profiles pp on pp.user_id = bp.user_id
        where bp.battle_id = $1
        order by bp.peak_score desc, bp.joined_at asc`,
      [battleId],
    );
    const participants = participantsResult.rows;
    if (participants.length === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'no_participants' }, { status: 500 });
    }

    // Tie detection: top two participants share the same peak score.
    // When tied, nobody is the winner, both (in 1v1) get a small
    // rating-disparity-driven ELO update, and `matches_tied`
    // increments on each profile. Streaks survive a tie.
    const topScore = participants[0].peak_score;
    const isTie =
      participants.length >= 2 && participants[1].peak_score === topScore;
    const winnerId = isTie ? null : participants[0].user_id;

    // Stamp final_score + is_winner. On tie, is_winner is false for
    // everyone (winnerId is null).
    await client.query(
      `update battle_participants
          set final_score = peak_score,
              is_winner = ($2::uuid is not null and user_id = $2)
        where battle_id = $1`,
      [battleId, winnerId],
    );

    // ----- ELO updates (public 1v1 only) -----
    let eloChanges: EloChange[] = [];
    if (battle.kind === 'public' && participants.length === 2) {
      const otherId =
        participants[1].user_id === winnerId
          ? participants[0].user_id
          : participants[1].user_id;
      const loserId = isTie ? null : otherId;

      // Lock both profiles in stable order (lower user_id first) to avoid
      // deadlocks if two simultaneous public battles share users in
      // pathological cases.
      const pairIds = [participants[0].user_id, participants[1].user_id].sort();
      const profilesResult = await client.query<ProfileRow>(
        `select user_id, elo, peak_elo, matches_played, matches_won,
                current_streak, longest_streak
           from profiles
          where user_id = any($1::uuid[])
          for update`,
        [pairIds],
      );

      const byId = new Map<string, ProfileRow>();
      for (const row of profilesResult.rows) byId.set(row.user_id, row);

      if (isTie) {
        // ---- Tie path ----
        // Both players' actual score = 0.5. ELO drifts based on
        // rating disparity. Streaks stay intact (a draw doesn't
        // break a hot streak in most rating systems).
        const a = byId.get(participants[0].user_id);
        const b = byId.get(participants[1].user_id);
        if (a && b) {
          const elo = computeEloTie({
            aElo: a.elo,
            aMatches: a.matches_played,
            bElo: b.elo,
            bMatches: b.matches_played,
          });

          await client.query(
            `update profiles
                set elo = $1,
                    peak_elo = greatest(peak_elo, $1),
                    matches_played = matches_played + 1,
                    matches_tied = matches_tied + 1
              where user_id = $2`,
            [elo.newAElo, a.user_id],
          );
          await client.query(
            `update profiles
                set elo = $1,
                    peak_elo = greatest(peak_elo, $1),
                    matches_played = matches_played + 1,
                    matches_tied = matches_tied + 1
              where user_id = $2`,
            [elo.newBElo, b.user_id],
          );

          eloChanges = [
            { user_id: a.user_id, before: a.elo, after: elo.newAElo, delta: elo.aDelta },
            { user_id: b.user_id, before: b.elo, after: elo.newBElo, delta: elo.bDelta },
          ];

          await client.query(
            `insert into elo_history (user_id, elo, delta, battle_id)
               values ($1, $2, $3, $5), ($4, $6, $7, $5)`,
            [
              a.user_id,
              elo.newAElo,
              elo.aDelta,
              b.user_id,
              battleId,
              elo.newBElo,
              elo.bDelta,
            ],
          );
        }
      } else {
        // ---- Win path ----
        const winnerProfile = winnerId ? byId.get(winnerId) : null;
        const loserProfile = loserId ? byId.get(loserId) : null;

        if (winnerProfile && loserProfile && winnerId && loserId) {
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

    // Build result payload + broadcast. `is_tie` rides at both the
    // top level (one tie = whole battle is tied) and per-participant
    // for convenience on the client.
    const resultParticipants: ResultParticipant[] = participants.map((p) => {
      // Derive weakest_sub_score from the best_scan jsonb so smart
      // name-fx like `name.callout` ("@opponent (jawline)") render
      // correctly on the result screen.
      let weakest: keyof SubScores | null = null;
      if (p.best_scan && typeof p.best_scan === 'object') {
        const bs = p.best_scan as { scores?: { sub?: SubScores } };
        if (bs.scores?.sub) {
          weakest = weakestSubScore({ overall: 0, sub: bs.scores.sub });
        }
      }
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        final_score: p.peak_score,
        is_winner: winnerId !== null && p.user_id === winnerId,
        is_tie: isTie,
        equipped_name_fx: p.equipped_name_fx,
        elo: p.elo,
        current_streak: p.current_streak,
        matches_won: p.matches_won,
        best_scan_overall: p.best_scan_overall,
        weakest_sub_score: weakest,
        is_subscriber:
          p.subscription_status === 'active' ||
          p.subscription_status === 'trialing',
      };
    });

    const payload = {
      battle_id: battleId,
      kind: battle.kind,
      winner_id: winnerId,
      is_tie: isTie,
      participants: resultParticipants,
      elo_changes: eloChanges,
    };
    void broadcastBattleEvent(battleId, 'battle.finished', payload);

    // Audit one row per participant — gives us a forensic trail for
    // ELO swings + winner attribution per battle. Caller-only would
    // miss the loser's perspective, which matters for cheat triage.
    for (const p of resultParticipants) {
      const elo = eloChanges.find((e) => e.user_id === p.user_id);
      void recordAudit({
        userId: p.user_id,
        action: 'battle_finish',
        resource: battleId,
        metadata: {
          kind: battle.kind,
          is_winner: p.is_winner,
          peak_score: p.final_score,
          elo_before: elo?.before,
          elo_after: elo?.after,
          elo_delta: elo?.delta,
        },
      });
    }

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
        grants = await checkAchievements(user.id, {
          matchesWon: s.matches_won,
          elo: s.elo,
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
    equipped_name_fx: string | null;
    elo: number;
    current_streak: number;
    matches_won: number;
    best_scan_overall: number | null;
    best_scan: unknown | null;
    subscription_status: string | null;
  }>(
    `select bp.user_id, bp.display_name, bp.final_score, bp.is_winner, bp.peak_score,
            pp.equipped_name_fx, pp.elo, pp.current_streak,
            pp.matches_won, pp.best_scan_overall, pp.best_scan,
            pp.subscription_status
       from battle_participants bp
       join profiles pp on pp.user_id = bp.user_id
      where bp.battle_id = $1
      order by bp.peak_score desc, bp.joined_at asc`,
    [battleId],
  );
  const winner = result.rows.find((p) => p.is_winner);
  // Reconstruct is_tie post-hoc: when no participant has is_winner=true
  // but the battle has finished participants, that's a tie. (Battles
  // that crashed mid-finalisation will land here too, but that's
  // tolerated — we'd rather treat an indeterminate state as a tie
  // than a fake-win.)
  const isTie = !winner && result.rows.length >= 2;
  return NextResponse.json({
    result: {
      battle_id: battleId,
      kind,
      winner_id: winner?.user_id ?? null,
      is_tie: isTie,
      participants: result.rows.map((p) => {
        let weakest: keyof SubScores | null = null;
        if (p.best_scan && typeof p.best_scan === 'object') {
          const bs = p.best_scan as { scores?: { sub?: SubScores } };
          if (bs.scores?.sub) {
            weakest = weakestSubScore({ overall: 0, sub: bs.scores.sub });
          }
        }
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          final_score: p.final_score ?? p.peak_score,
          is_winner: p.is_winner,
          is_tie: isTie,
          equipped_name_fx: p.equipped_name_fx,
          elo: p.elo,
          current_streak: p.current_streak,
          matches_won: p.matches_won,
          best_scan_overall: p.best_scan_overall,
          weakest_sub_score: weakest,
          is_subscriber:
            p.subscription_status === 'active' ||
            p.subscription_status === 'trialing',
        };
      }),
      elo_changes: [],
    },
  });
}
