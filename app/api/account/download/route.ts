import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/account/download
 *
 * GDPR Art. 20 compliant: returns every piece of data we hold about the
 * caller as one JSON file with `Content-Disposition: attachment`. Sensitive
 * fields (TOTP secret, backup-code hashes, OAuth tokens) are deliberately
 * stripped — exporting them would teach a thief how to impersonate the
 * user even if we technically "have" the data.
 *
 * Aggregated in parallel; one round-trip per table to keep the latency
 * bounded by the slowest single query.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();

  const [
    userRow,
    profileRow,
    emailPrefs,
    scans,
    battles,
    eloHistory,
    audit,
    purchases,
    inventory,
    sessions,
    accounts,
  ] = await Promise.all([
    pool.query(
      `select id, name, email, "emailVerified", image
         from users where id = $1 limit 1`,
      [user.id],
    ),
    pool.query(
      `select user_id, display_name, elo, peak_elo, matches_played, matches_won,
              current_streak, longest_streak, best_scan_overall, best_scan,
              improvement_counts, bio, socials,
              hide_photo_from_leaderboard, hide_elo, mute_battle_sfx,
              weekly_digest, mog_email_alerts,
              equipped_flair, equipped_theme, equipped_frame,
              two_factor_enabled, previous_usernames,
              created_at, updated_at
         from profiles where user_id = $1 limit 1`,
      [user.id],
    ),
    pool.query(
      `select user_id, weekly_digest, mog_alerts, battle_invites, last_digest_sent_at
         from email_preferences where user_id = $1 limit 1`,
      [user.id],
    ),
    pool.query(
      `select id, overall, jawline, eyes, skin, cheekbones, presentation, vision, created_at
         from scan_history where user_id = $1 order by created_at asc`,
      [user.id],
    ),
    pool.query(
      `select b.id as battle_id, b.kind, b.code, b.state, b.created_at, b.started_at, b.finished_at,
              bp.peak_score, bp.final_score, bp.is_winner, bp.joined_at, bp.left_at,
              (select json_agg(json_build_object(
                  'user_id', op.user_id,
                  'display_name', op.display_name,
                  'peak_score', op.peak_score,
                  'is_winner', op.is_winner
                ))
                 from battle_participants op
                where op.battle_id = b.id and op.user_id <> $1
              ) as opponents
         from battle_participants bp
         join battles b on b.id = bp.battle_id
        where bp.user_id = $1
        order by b.created_at asc`,
      [user.id],
    ),
    pool.query(
      `select elo, recorded_at
         from elo_history where user_id = $1 order by recorded_at asc`,
      [user.id],
    ),
    pool.query(
      `select action, resource, metadata, created_at
         from audit_log where user_id = $1 order by created_at asc`,
      [user.id],
    ),
    pool.query(
      `select stripe_session_id, stripe_payment_intent, amount_cents, status,
              items_jsonb, created_at
         from stripe_purchases where user_id = $1 order by created_at asc`,
      [user.id],
    ),
    pool.query(
      `select item_slug, source, purchased_at, stripe_payment_intent
         from user_inventory where user_id = $1 order by purchased_at asc`,
      [user.id],
    ),
    pool.query(
      `select expires
         from sessions where "userId" = $1 order by expires asc`,
      [user.id],
    ),
    // Connected OAuth providers — `provider` only, never tokens.
    pool.query(
      `select provider, type from accounts where "userId" = $1 order by provider asc`,
      [user.id],
    ),
  ]);

  // Pull leaderboard entry (lives in Supabase, not Postgres pool).
  let leaderboardEntry: unknown = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    leaderboardEntry = data ?? null;
  }

  const dump = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    user: userRow.rows[0] ?? null,
    profile: profileRow.rows[0] ?? null,
    email_preferences: emailPrefs.rows[0] ?? null,
    scans: scans.rows,
    battles: battles.rows,
    elo_history: eloHistory.rows,
    leaderboard_entry: leaderboardEntry,
    audit_log: audit.rows,
    purchases: purchases.rows,
    inventory: inventory.rows,
    sessions: sessions.rows,
    connected_accounts: accounts.rows,
    notes: {
      excluded:
        'TOTP secret, backup-code hashes, and OAuth access/refresh tokens are intentionally excluded — exporting them would teach a thief how to impersonate the account.',
      contact: 'hello@holymog.com for any data-handling questions.',
    },
  };

  return new NextResponse(JSON.stringify(dump, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="holymog-${user.id}.mog.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
