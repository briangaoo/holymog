import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import {
  FACES_BUCKET,
  getSupabase,
  getSupabaseAdmin,
  type LeaderboardRow,
} from '@/lib/supabase';
import { getRatelimit } from '@/lib/ratelimit';
import { isReservedUsername } from '@/lib/reservedUsernames';
import { weakestSubScore } from '@/lib/scoreEngine';
import { recordAudit } from '@/lib/audit';
import type { SubScores } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Profile = {
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  best_scan: unknown;
  improvement_counts: Record<string, number>;
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  socials: Record<string, string | null> | null;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  mute_battle_sfx: boolean;
  weekly_digest: boolean;
  mog_email_alerts: boolean;
  equipped_flair: string | null;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_name_fx: string | null;
  two_factor_enabled: boolean;
  followers_count: number;
  following_count: number;
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_started_at: string | null;
  subscription_current_period_end: string | null;
  monthly_cosmetic_claimed_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const SOCIAL_KEYS = ['instagram', 'x', 'snapchat', 'tiktok', 'discord'] as const;
const MAX_BIO_LEN = 240;
const MAX_LOCATION_LEN = 60;
const MAX_SOCIAL_LEN = 32;
const USERNAME_REGEX = /^[a-z0-9_-]{3,24}$/;

type ScanHistoryAvg = {
  jawline_avg: number | null;
  eyes_avg: number | null;
  skin_avg: number | null;
  cheekbones_avg: number | null;
  presentation_avg: number | null;
  count: number;
};

const ELO_SPARKLINE_LIMIT = 30;
const MOST_IMPROVED_WINDOW = 5;

/**
 * GET — return the current authenticated user's profile + their leaderboard
 * row (if any) + lifetime aggregates (sparkline, total scans, account
 * age, highest overall ever, most-improved metric).
 *
 * Aggregates are computed in parallel with the profile lookup so the
 * combined latency is bounded by the slowest single query.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();

  const [
    profileResult,
    eloHistory,
    totalScansResult,
    highestOverallResult,
    mostImproved,
    recentBattles,
    biggestSwings,
    tierDistribution,
  ] = await Promise.all([
      pool.query<Profile>(
        `select
           display_name, elo, peak_elo, matches_played, matches_won,
           current_streak, longest_streak, best_scan_overall,
           best_scan, improvement_counts,
           bio, location, banner_url, socials,
           hide_photo_from_leaderboard, hide_elo, mute_battle_sfx,
           weekly_digest, mog_email_alerts,
           equipped_flair, equipped_theme, equipped_frame, equipped_name_fx,
           two_factor_enabled,
           coalesce(followers_count, 0) as followers_count,
           coalesce(following_count, 0) as following_count,
           subscription_status, subscription_tier, subscription_started_at,
           subscription_current_period_end, monthly_cosmetic_claimed_at,
           stripe_subscription_id,
           created_at, updated_at
           from profiles
          where user_id = $1
          limit 1`,
        [user.id],
      ),
      pool.query<{ elo: number; recorded_at: Date }>(
        `select elo, recorded_at
           from elo_history
          where user_id = $1
          order by recorded_at desc
          limit $2`,
        [user.id, ELO_SPARKLINE_LIMIT],
      ),
      pool.query<{ c: number }>(
        `select count(*)::int as c from scan_history where user_id = $1`,
        [user.id],
      ),
      pool.query<{ highest: number | null }>(
        `select greatest(
           coalesce((select max(overall) from scan_history where user_id = $1), 0),
           coalesce((select best_scan_overall from profiles where user_id = $1), 0)
         ) as highest`,
        [user.id],
      ),
      computeMostImproved(pool, user.id),
      // Last 10 finished battles for the W/L pip strip — oldest left,
      // newest right (we reverse client-side).
      pool.query<{ is_winner: boolean }>(
        `select bp.is_winner
           from battle_participants bp
           join battles b on b.id = bp.battle_id
          where bp.user_id = $1 and b.state = 'finished'
          order by b.finished_at desc nulls last, bp.joined_at desc
          limit 10`,
        [user.id],
      ),
      // Biggest single-battle ELO win + loss with opponent + battle.
      pool.query<{
        delta: number;
        battle_id: string | null;
        finished_at: Date | null;
        opponent_display_name: string | null;
        kind: 'min' | 'max';
      }>(
        `(select 'max'::text as kind, eh.delta, eh.battle_id, b.finished_at,
                 (select op.display_name
                    from battle_participants op
                   where op.battle_id = eh.battle_id and op.user_id <> $1
                   limit 1) as opponent_display_name
            from elo_history eh
            left join battles b on b.id = eh.battle_id
           where eh.user_id = $1 and eh.delta is not null
           order by eh.delta desc
           limit 1)
         union all
         (select 'min'::text as kind, eh.delta, eh.battle_id, b.finished_at,
                 (select op.display_name
                    from battle_participants op
                   where op.battle_id = eh.battle_id and op.user_id <> $1
                   limit 1) as opponent_display_name
            from elo_history eh
            left join battles b on b.id = eh.battle_id
           where eh.user_id = $1 and eh.delta is not null
           order by eh.delta asc
           limit 1)`,
        [user.id],
      ),
      // All scan overalls so we can bucket into tiers client-side via
      // getTier(). Cheap even at thousands of scans (just integers).
      pool.query<{ overall: number }>(
        `select overall from scan_history where user_id = $1`,
        [user.id],
      ),
    ]);

  const profile = profileResult.rows[0] ?? null;

  let entry: LeaderboardRow | null = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    entry = (data as LeaderboardRow | null) ?? null;
  }

  const totalScans = totalScansResult.rows[0]?.c ?? 0;
  const highestRaw = highestOverallResult.rows[0]?.highest ?? 0;
  const highestOverallEver = highestRaw > 0 ? highestRaw : null;

  const accountAgeDays = profile?.created_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000,
        ),
      )
    : 0;

  // Sparkline returned oldest-first so the chart can iterate left-to-right.
  const sparkline = eloHistory.rows
    .slice()
    .reverse()
    .map((row) => ({ elo: row.elo, recorded_at: row.recorded_at.toISOString() }));

  // Recent W/L strip — server returns newest-first; client reverses for
  // chronological left-to-right.
  const recentBattleResults = recentBattles.rows.map((r) => r.is_winner);

  // Biggest swings — split the union into max/min entries.
  const swingsByKind = new Map<'max' | 'min', (typeof biggestSwings.rows)[number]>();
  for (const row of biggestSwings.rows) swingsByKind.set(row.kind, row);
  const biggestWinRow = swingsByKind.get('max');
  const biggestLossRow = swingsByKind.get('min');
  const biggestWin = biggestWinRow
    ? {
        delta: biggestWinRow.delta,
        opponent_display_name: biggestWinRow.opponent_display_name,
        finished_at: biggestWinRow.finished_at?.toISOString() ?? null,
      }
    : null;
  const biggestLoss = biggestLossRow
    ? {
        delta: biggestLossRow.delta,
        opponent_display_name: biggestLossRow.opponent_display_name,
        finished_at: biggestLossRow.finished_at?.toISOString() ?? null,
      }
    : null;

  // Derive weakest_sub_score from profiles.best_scan jsonb. Stored shape
  // (set by /api/score and /api/account/migrate-scan):
  //   { vision: VisionScore, scores: { overall, sub: {...} } }.
  // Used by the `name.callout` smart cosmetic for the live "(jawline)"
  // suffix next to display names. null when no best scan recorded.
  let weakest_sub_score: keyof SubScores | null = null;
  if (profile?.best_scan && typeof profile.best_scan === 'object') {
    const bs = profile.best_scan as { scores?: { sub?: SubScores } };
    if (bs.scores?.sub) {
      weakest_sub_score = weakestSubScore({
        overall: 0,
        sub: bs.scores.sub,
      });
    }
  }

  const is_subscriber =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing';

  return NextResponse.json({
    profile,
    entry,
    total_scans: totalScans,
    account_age_days: accountAgeDays,
    highest_overall_ever: highestOverallEver,
    elo_sparkline: sparkline,
    most_improved: mostImproved,
    recent_battle_results: recentBattleResults,
    biggest_win:
      biggestWin && biggestWin.delta > 0 ? biggestWin : null,
    biggest_loss:
      biggestLoss && biggestLoss.delta < 0 ? biggestLoss : null,
    scan_overalls: tierDistribution.rows.map((r) => r.overall),
    weakest_sub_score,
    is_subscriber,
  });
}

/**
 * Compute the user's "most improved" sub-metric. Compares the average
 * of their oldest 5 scans against the average of their newest 5. The
 * metric with the largest positive delta wins; returns null if the user
 * has fewer than 10 scans (not enough signal yet) or if every metric
 * regressed.
 */
async function computeMostImproved(
  pool: ReturnType<typeof getPool>,
  userId: string,
): Promise<{ metric: string; delta: number } | null> {
  // Pull oldest N + newest N in two queries.
  const [oldest, newest] = await Promise.all([
    pool.query<ScanHistoryAvg>(
      `select
         avg(jawline)::float as jawline_avg,
         avg(eyes)::float as eyes_avg,
         avg(skin)::float as skin_avg,
         avg(cheekbones)::float as cheekbones_avg,
         avg(presentation)::float as presentation_avg,
         count(*)::int as count
         from (
           select * from scan_history where user_id = $1
            order by created_at asc
            limit $2
         ) sub`,
      [userId, MOST_IMPROVED_WINDOW],
    ),
    pool.query<ScanHistoryAvg>(
      `select
         avg(jawline)::float as jawline_avg,
         avg(eyes)::float as eyes_avg,
         avg(skin)::float as skin_avg,
         avg(cheekbones)::float as cheekbones_avg,
         avg(presentation)::float as presentation_avg,
         count(*)::int as count
         from (
           select * from scan_history where user_id = $1
            order by created_at desc
            limit $2
         ) sub`,
      [userId, MOST_IMPROVED_WINDOW],
    ),
  ]);

  const oldRow = oldest.rows[0];
  const newRow = newest.rows[0];
  if (!oldRow || !newRow) return null;
  // Need at least 5 in each window; require 10 total to keep the signal
  // meaningful (otherwise oldest and newest overlap heavily).
  if (oldRow.count < MOST_IMPROVED_WINDOW || newRow.count < MOST_IMPROVED_WINDOW) {
    return null;
  }

  const deltas: Array<{ metric: string; delta: number }> = [];
  for (const key of [
    'jawline',
    'eyes',
    'skin',
    'cheekbones',
    'presentation',
  ] as const) {
    const o = oldRow[`${key}_avg` as keyof ScanHistoryAvg] as number | null;
    const n = newRow[`${key}_avg` as keyof ScanHistoryAvg] as number | null;
    if (o == null || n == null) continue;
    deltas.push({ metric: key, delta: Math.round((n - o) * 10) / 10 });
  }
  deltas.sort((a, b) => b.delta - a.delta);
  const top = deltas[0];
  if (!top || top.delta <= 0) return null;
  return top;
}

/**
 * PATCH body shape — every field is optional. Only fields present in
 * the request body get updated. `display_name` has its own validation
 * + rate-limit + previous-usernames bookkeeping path; toggle / text
 * fields share the dynamic-update pipeline below.
 */
type PatchBody = {
  display_name?: unknown;
  bio?: unknown;
  location?: unknown;
  socials?: unknown;
  hide_photo_from_leaderboard?: unknown;
  hide_elo?: unknown;
  mute_battle_sfx?: unknown;
  weekly_digest?: unknown;
  mog_email_alerts?: unknown;
};

/**
 * Validate and coerce the patchable boolean / text fields. Returns
 * `{ ok: true, fields }` or `{ ok: false, error, message? }`.
 *
 * `socials` is a special case — a partial object whose keys must be in
 * SOCIAL_KEYS. Each value is trimmed; an empty string clears the slot.
 * The whole jsonb column is rewritten on every save (we merge the
 * incoming patch with the existing socials object on the server in the
 * caller below).
 */
type FieldUpdates = {
  bio?: string | null;
  location?: string | null;
  socials?: Record<string, string> | null;
  hide_photo_from_leaderboard?: boolean;
  hide_elo?: boolean;
  mute_battle_sfx?: boolean;
  weekly_digest?: boolean;
  mog_email_alerts?: boolean;
};

function validateFields(
  body: PatchBody,
):
  | { ok: true; fields: FieldUpdates }
  | { ok: false; error: string; message?: string } {
  const fields: FieldUpdates = {};

  if ('bio' in body) {
    if (body.bio === null) {
      fields.bio = null;
    } else if (typeof body.bio === 'string') {
      const trimmed = body.bio.trim();
      if (trimmed.length > MAX_BIO_LEN) {
        return {
          ok: false,
          error: 'bio_too_long',
          message: `Bio max ${MAX_BIO_LEN} characters.`,
        };
      }
      fields.bio = trimmed.length === 0 ? null : trimmed;
    } else {
      return { ok: false, error: 'invalid_bio' };
    }
  }

  if ('location' in body) {
    if (body.location === null) {
      fields.location = null;
    } else if (typeof body.location === 'string') {
      const trimmed = body.location.trim();
      if (trimmed.length > MAX_LOCATION_LEN) {
        return {
          ok: false,
          error: 'location_too_long',
          message: `Location max ${MAX_LOCATION_LEN} characters.`,
        };
      }
      fields.location = trimmed.length === 0 ? null : trimmed;
    } else {
      return { ok: false, error: 'invalid_location' };
    }
  }

  if ('socials' in body) {
    if (body.socials !== null && typeof body.socials !== 'object') {
      return { ok: false, error: 'invalid_socials' };
    }
    if (body.socials === null) {
      fields.socials = null;
    } else {
      const incoming = body.socials as Record<string, unknown>;
      const cleaned: Record<string, string> = {};
      for (const key of SOCIAL_KEYS) {
        const value = incoming[key];
        if (value === undefined) continue;
        if (value === null || value === '') {
          // explicit clear — keep absent so the merge in caller drops it
          cleaned[key] = '';
          continue;
        }
        if (typeof value !== 'string') {
          return { ok: false, error: 'invalid_socials' };
        }
        const trimmed = value.trim().slice(0, MAX_SOCIAL_LEN);
        if (trimmed.length === 0) continue;
        cleaned[key] = trimmed;
      }
      // Reject unknown keys (defense-in-depth — silently dropped above).
      for (const key of Object.keys(incoming)) {
        if (!SOCIAL_KEYS.includes(key as (typeof SOCIAL_KEYS)[number])) {
          return { ok: false, error: 'unknown_social_key' };
        }
      }
      fields.socials = cleaned;
    }
  }

  for (const flag of [
    'hide_photo_from_leaderboard',
    'hide_elo',
    'mute_battle_sfx',
    'weekly_digest',
    'mog_email_alerts',
  ] as const) {
    if (flag in body) {
      const value = body[flag];
      if (typeof value !== 'boolean') {
        return { ok: false, error: `invalid_${flag}` };
      }
      fields[flag] = value;
    }
  }

  return { ok: true, fields };
}

/**
 * PATCH — update the current user's profile. Accepts:
 *   - display_name (validated, rate-limited, syncs leaderboard row)
 *   - bio (text, ≤240 chars)
 *   - socials (partial merge — keys: instagram, x, snapchat, tiktok, discord)
 *   - hide_photo_from_leaderboard, hide_elo (privacy toggles)
 *   - mute_battle_sfx (gameplay toggle)
 *   - weekly_digest, mog_email_alerts (notification toggles, also synced
 *     to email_preferences)
 *
 * Only the fields present in the body get updated; missing fields are
 * untouched. The username path retains its own validation +
 * rate-limit; non-username field updates share a single dynamic UPDATE.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const pool = getPool();

  // ---- Username path (separate, rate-limited) ----------------------------
  if ('display_name' in body) {
    const limiter = getRatelimit('username');
    if (limiter) {
      const result = await limiter.limit(user.id);
      if (!result.success) {
        return NextResponse.json(
          {
            error: 'rate_limited',
            message: 'Too many username changes. Try again later.',
          },
          { status: 429 },
        );
      }
    }

    if (typeof body.display_name !== 'string') {
      return NextResponse.json({ error: 'invalid_username' }, { status: 400 });
    }
    const display = body.display_name.trim().toLowerCase();
    if (!USERNAME_REGEX.test(display)) {
      return NextResponse.json(
        {
          error: 'invalid_username',
          message:
            'Usernames must be 3–24 characters, lowercase letters, digits, underscores, or hyphens only.',
        },
        { status: 400 },
      );
    }
    if (isReservedUsername(display)) {
      return NextResponse.json(
        {
          error: 'username_reserved',
          message: 'That username is reserved. Try another.',
        },
        { status: 409 },
      );
    }

    const taken = await pool.query<{ user_id: string }>(
      'select user_id from profiles where display_name = $1 and user_id <> $2 limit 1',
      [display, user.id],
    );
    if (taken.rows.length > 0) {
      return NextResponse.json({ error: 'username_taken' }, { status: 409 });
    }

    await pool.query(
      `update profiles
          set display_name = $1,
              previous_usernames =
                (array_remove(coalesce(previous_usernames, array[]::text[]) || display_name, $1))
                [greatest(1, array_length(coalesce(previous_usernames, array[]::text[]) || display_name, 1) - 9):]
        where user_id = $2`,
      [display, user.id],
    );
    await pool
      .query(`update leaderboard set name = $1 where user_id = $2`, [
        display,
        user.id,
      ])
      .catch(() => {});

    void recordAudit({
      userId: user.id,
      action: 'username_change',
      metadata: { new_display_name: display },
    });

    return NextResponse.json({ ok: true, display_name: display });
  }

  // ---- Field updates (bio, socials, toggles) -----------------------------
  const validation = validateFields(body);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
        ...(validation.message ? { message: validation.message } : {}),
      },
      { status: 400 },
    );
  }
  const fields = validation.fields;

  if (Object.keys(fields).length === 0) {
    // Nothing to update.
    return NextResponse.json({ ok: true });
  }

  // For socials, merge with existing — empty string clears a slot,
  // omitted slot is left untouched.
  let mergedSocials: Record<string, string> | null | undefined;
  if (fields.socials !== undefined) {
    if (fields.socials === null) {
      mergedSocials = null;
    } else {
      const existing = await pool.query<{ socials: Record<string, string> | null }>(
        'select socials from profiles where user_id = $1 limit 1',
        [user.id],
      );
      const current = existing.rows[0]?.socials ?? {};
      const next: Record<string, string> = { ...current };
      for (const [key, value] of Object.entries(fields.socials)) {
        if (value === '') delete next[key];
        else next[key] = value;
      }
      mergedSocials = next;
    }
  }

  // Build dynamic UPDATE.
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if ('bio' in fields) {
    sets.push(`bio = $${i++}`);
    values.push(fields.bio);
  }
  if ('location' in fields) {
    sets.push(`location = $${i++}`);
    values.push(fields.location);
  }
  if (mergedSocials !== undefined) {
    sets.push(`socials = $${i++}::jsonb`);
    values.push(mergedSocials === null ? null : JSON.stringify(mergedSocials));
  }
  for (const flag of [
    'hide_photo_from_leaderboard',
    'hide_elo',
    'mute_battle_sfx',
    'weekly_digest',
    'mog_email_alerts',
  ] as const) {
    if (flag in fields) {
      sets.push(`${flag} = $${i++}`);
      values.push(fields[flag]);
    }
  }
  values.push(user.id);

  await pool.query(
    `update profiles set ${sets.join(', ')} where user_id = $${i}`,
    values,
  );

  // Mirror notification toggles to email_preferences (canonical source for
  // the cron job). UPSERT so the row exists even for users who never had
  // it created at signup.
  if ('weekly_digest' in fields || 'mog_email_alerts' in fields) {
    await pool.query(
      `insert into email_preferences (user_id, weekly_digest, mog_alerts)
         values ($1, $2, $3)
         on conflict (user_id) do update
           set weekly_digest = coalesce($2, email_preferences.weekly_digest),
               mog_alerts    = coalesce($3, email_preferences.mog_alerts)`,
      [
        user.id,
        fields.weekly_digest ?? null,
        fields.mog_email_alerts ?? null,
      ],
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/account/me
 *
 * Permanent account deletion. Cascades via the FKs in Phase 0 +
 * subsequent migrations:
 *   profiles, leaderboard, battle_participants, matchmaking_queue,
 *   accounts, sessions, scan_history, elo_history, email_preferences,
 *   user_inventory, stripe_purchases, audit_log (set null).
 *
 * Storage cleanup is best-effort; orphan files are acceptable.
 *
 * Client should call signOut() after this resolves.
 */
export async function DELETE() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  let leaderboardImagePath: string | null = null;
  if (supabase) {
    const { data } = await supabase
      .from('leaderboard')
      .select('image_path')
      .eq('user_id', user.id)
      .maybeSingle();
    leaderboardImagePath = data?.image_path ?? null;
  }

  const pool = getPool();
  // Audit BEFORE the delete so the row points at the user that
  // existed at delete time. ON DELETE SET NULL on audit_log's
  // user_id FK preserves the row through cascade.
  await recordAudit({
    userId: user.id,
    action: 'account_delete',
    metadata: {
      had_leaderboard_entry: leaderboardImagePath !== null,
    },
  });
  await pool.query(`delete from users where id = $1`, [user.id]);

  if (supabase) {
    const paths: string[] = [
      `avatars/${user.id}.png`,
      `avatars/${user.id}.jpg`,
    ];
    if (leaderboardImagePath) paths.push(leaderboardImagePath);
    await supabase.storage
      .from(FACES_BUCKET)
      .remove(paths)
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
