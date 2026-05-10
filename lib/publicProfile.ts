import { getPool } from '@/lib/db';
import { weakestSubScore } from '@/lib/scoreEngine';
import type { SubScores } from '@/types';

export type PublicProfileData = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  socials: Partial<{
    instagram: string;
    x: string;
    snapchat: string;
    tiktok: string;
    discord: string;
  }>;
  equipped_flair: string | null;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_name_fx: string | null;
  hide_elo: boolean;
  /** Server-computed: lowest sub-score on this user's best scan. Used
   *  by the `name.callout` smart cosmetic to display "(jawline)" etc.
   *  next to the display name. null when no best scan exists. */
  weakest_sub_score: keyof SubScores | null;
  /** True when subscription_status is 'active' or 'trialing'. Drives
   *  the SubscriberBadge that renders next to the display name on
   *  every surface where this user appears. */
  is_subscriber: boolean;
  /** Social graph counts. */
  followers_count: number;
  following_count: number;
  /** True only when a signed-in viewer (other than the profile owner)
   *  is currently following this user. Server populates this from the
   *  caller's session; null on unauthenticated views or on the user's
   *  own profile. */
  viewer_is_following: boolean | null;
  /** True when the signed-in viewer is the profile owner. Drives the
   *  "edit profile" button vs the "follow" button. */
  is_own_profile: boolean;
  // Public stats (some nulled when hidden)
  elo: number | null;
  peak_elo: number | null;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  total_scans: number;
  account_age_days: number;
  /** Last activity timestamp — most recent scan OR battle. Drives the
   *  "active 3d ago" indicator under the display name. */
  last_active_at: string | null;
  /** Their leaderboard photo if they've submitted one. Hero showcase. */
  best_scan_photo: string | null;
  /** ELO snapshots oldest-first for the climb chart on the profile. */
  elo_sparkline: number[];
  /** Slugs the user owns. Drives the "collection" shelf — viewers see
   *  what flair they could buy / earn to match. */
  inventory_slugs: string[];
  recent_battles: Array<{
    battle_id: string;
    finished_at: string | null;
    is_winner: boolean;
    peak_score: number;
    opponent_display_name: string | null;
    opponent_peak_score: number | null;
  }>;
};

export type LookupResult =
  | { kind: 'found'; data: PublicProfileData }
  | { kind: 'redirect'; canonical_username: string }
  | { kind: 'not_found' };

type DirectRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  socials: PublicProfileData['socials'] | null;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  equipped_flair: string | null;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_name_fx: string | null;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  best_scan: unknown | null;
  followers_count: number;
  following_count: number;
  subscription_status: string | null;
  created_at: Date;
  total_scans: number;
};

type RecentBattleRow = {
  battle_id: string;
  finished_at: Date | null;
  is_winner: boolean;
  peak_score: number;
  opponent_display_name: string | null;
  opponent_peak_score: number | null;
};

/**
 * Resolve a public profile by username. Tries the current `display_name`
 * first; on miss falls through to `previous_usernames` for redirect
 * handling. Privacy toggles (`hide_photo_from_leaderboard`, `hide_elo`)
 * are applied here so callers don't have to remember.
 *
 * `viewerUserId` is the optional signed-in viewer's user_id; used to
 * compute `is_own_profile` and `viewer_is_following`.
 */
export async function lookupPublicProfile(
  username: string,
  viewerUserId?: string | null,
): Promise<LookupResult> {
  const pool = getPool();
  const normalized = username.trim().toLowerCase();
  if (!normalized) return { kind: 'not_found' };

  const direct = await pool.query<DirectRow>(
    `select
       p.user_id, p.display_name, p.bio, p.socials,
       p.location, p.banner_url,
       p.hide_photo_from_leaderboard, p.hide_elo,
       p.equipped_flair, p.equipped_theme, p.equipped_frame, p.equipped_name_fx,
       p.elo, p.peak_elo, p.matches_played, p.matches_won,
       p.current_streak, p.longest_streak, p.best_scan_overall, p.best_scan,
       coalesce(p.followers_count, 0) as followers_count,
       coalesce(p.following_count, 0) as following_count,
       p.subscription_status,
       p.created_at,
       u.image as avatar_url,
       coalesce(
         (select count(*)::int from scan_history sh where sh.user_id = p.user_id),
         0
       ) as total_scans
       from profiles p
       join users u on u.id = p.user_id
      where p.display_name = $1
      limit 1`,
    [normalized],
  );

  if (direct.rows.length === 0) {
    const redir = await pool.query<{ display_name: string }>(
      `select display_name
         from profiles
        where $1 = any(coalesce(previous_usernames, array[]::text[]))
        limit 1`,
      [normalized],
    );
    if (redir.rows.length > 0) {
      return { kind: 'redirect', canonical_username: redir.rows[0].display_name };
    }
    return { kind: 'not_found' };
  }

  const row = direct.rows[0];

  const isOwnProfile = !!viewerUserId && viewerUserId === row.user_id;

  const [recent, lastActive, bestPhoto, eloHistory, inventory, followingFlag] =
    await Promise.all([
      pool.query<RecentBattleRow>(
        `select
           b.id as battle_id,
           b.finished_at,
           bp.is_winner,
           bp.peak_score,
           (select op.display_name
              from battle_participants op
             where op.battle_id = b.id and op.user_id <> $1
             order by op.joined_at asc
             limit 1) as opponent_display_name,
           (select op.peak_score
              from battle_participants op
             where op.battle_id = b.id and op.user_id <> $1
             order by op.joined_at asc
             limit 1) as opponent_peak_score
           from battle_participants bp
           join battles b on b.id = bp.battle_id
          where bp.user_id = $1
            and b.state = 'finished'
          order by coalesce(b.finished_at, b.created_at) desc
          limit 5`,
        [row.user_id],
      ),
      // Last activity = max of last scan, last battle join, last battle finish.
      pool.query<{ last_active: Date | null }>(
        `select greatest(
           coalesce((select max(created_at) from scan_history where user_id = $1), 'epoch'::timestamptz),
           coalesce((select max(joined_at) from battle_participants where user_id = $1), 'epoch'::timestamptz)
         ) as last_active`,
        [row.user_id],
      ),
      // Leaderboard photo (skip if user has hide_photo on — already enforced
      // by row.hide_photo_from_leaderboard upstream).
      row.hide_photo_from_leaderboard
        ? Promise.resolve({ rows: [] as Array<{ image_url: string | null }> })
        : pool.query<{ image_url: string | null }>(
            `select image_url from leaderboard where user_id = $1 limit 1`,
            [row.user_id],
          ),
      // Up to 30 most recent ELO snapshots, returned oldest-first.
      row.hide_elo
        ? Promise.resolve({ rows: [] as Array<{ elo: number }> })
        : pool.query<{ elo: number }>(
            `select elo from (
               select elo, recorded_at
                 from elo_history
                where user_id = $1
                order by recorded_at desc
                limit 30
             ) sub
              order by recorded_at asc`,
            [row.user_id],
          ),
      pool.query<{ item_slug: string }>(
        `select item_slug from user_inventory where user_id = $1`,
        [row.user_id],
      ),
      // Viewer-relative: is the signed-in caller currently following
      // this profile? null both when no viewer and when viewer is the
      // owner (UI shows "edit profile" instead of follow button).
      viewerUserId && !isOwnProfile
        ? pool.query<{ exists: boolean }>(
            `select exists(
               select 1 from follows
                where follower_user_id = $1
                  and followed_user_id = $2
             ) as exists`,
            [viewerUserId, row.user_id],
          )
        : Promise.resolve({ rows: [] as Array<{ exists: boolean }> }),
    ]);

  const accountAgeMs = Date.now() - new Date(row.created_at).getTime();
  const accountAgeDays = Math.max(0, Math.floor(accountAgeMs / 86_400_000));

  const lastActiveAt = lastActive.rows[0]?.last_active ?? null;
  const lastActiveIso =
    lastActiveAt &&
    new Date(lastActiveAt).getTime() > 86_400_000 // not the epoch fallback
      ? new Date(lastActiveAt).toISOString()
      : null;

  // Derive weakest_sub_score from the best_scan JSONB. Stored shape:
  // { vision, scores: { overall, sub: { jawline, eyes, skin, cheekbones } } }.
  let weakest_sub_score: keyof SubScores | null = null;
  if (row.best_scan && typeof row.best_scan === 'object') {
    const bs = row.best_scan as { scores?: { sub?: SubScores } };
    if (bs.scores?.sub) {
      weakest_sub_score = weakestSubScore({
        overall: 0,
        sub: bs.scores.sub,
      });
    }
  }

  const is_subscriber =
    row.subscription_status === 'active' || row.subscription_status === 'trialing';

  return {
    kind: 'found',
    data: {
      user_id: row.user_id,
      display_name: row.display_name,
      // Profile picture (users.image) always shows publicly — that's
      // identity, not the leaderboard submission. The hide-photo
      // toggle only suppresses their submitted scan face (best_scan_photo
      // below).
      avatar_url: row.avatar_url,
      bio: row.bio,
      location: row.location,
      banner_url: row.banner_url,
      socials: row.socials ?? {},
      equipped_flair: row.equipped_flair,
      equipped_theme: row.equipped_theme,
      equipped_frame: row.equipped_frame,
      equipped_name_fx: row.equipped_name_fx,
      hide_elo: row.hide_elo,
      weakest_sub_score,
      is_subscriber,
      elo: row.hide_elo ? null : row.elo,
      peak_elo: row.hide_elo ? null : row.peak_elo,
      matches_played: row.matches_played,
      matches_won: row.matches_won,
      current_streak: row.current_streak,
      longest_streak: row.longest_streak,
      best_scan_overall: row.best_scan_overall,
      total_scans: row.total_scans,
      account_age_days: accountAgeDays,
      last_active_at: lastActiveIso,
      best_scan_photo: bestPhoto.rows[0]?.image_url ?? null,
      elo_sparkline: eloHistory.rows.map((r) => r.elo),
      inventory_slugs: inventory.rows.map((r) => r.item_slug),
      followers_count: row.followers_count,
      following_count: row.following_count,
      viewer_is_following: viewerUserId
        ? (followingFlag.rows[0]?.exists ?? false)
        : null,
      is_own_profile: isOwnProfile,
      recent_battles: recent.rows.map((r) => ({
        battle_id: r.battle_id,
        finished_at: r.finished_at?.toISOString() ?? null,
        is_winner: r.is_winner,
        peak_score: r.peak_score,
        opponent_display_name: r.opponent_display_name,
        opponent_peak_score: r.opponent_peak_score,
      })),
    },
  };
}
