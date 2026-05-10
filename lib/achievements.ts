import { getPool } from '@/lib/db';

/**
 * Achievement engine. Each ACHIEVEMENT entry maps a stable key to:
 *   - the cosmetic slug it unlocks
 *   - a human-readable name + description for the unlock toast
 *   - the threshold target (for `current / target` progress UI in store)
 *
 * `checkAchievements(userId, stats)` evaluates every threshold that
 * has data in `stats`, grants the matching inventory rows + stamps
 * `achievement_progress.achieved_at` atomically, and returns the
 * newly-earned grants so callers can ship them to the client for a
 * toast notification.
 *
 * Some thresholds grant MULTIPLE slugs (A-tier scan = 3 items; bio
 * set = 2 items; 25 wins = 2 items; 1 scan = 2 items). Each grant
 * is its own `achievement_progress` row keyed on the achievement_key,
 * so toasts fire per-item.
 */

export type AchievementCheck = {
  key: string;
  slug: string;
  name: string;
  description: string;
  /** Threshold the underlying counter compares against. Surfaced as
   *  the denominator in "3 / 5 wins" progress bars in the store UI. */
  progressTarget: number;
};

export const ACHIEVEMENTS: Record<string, AchievementCheck> = {
  // ---- Frames (5) -------------------------------------------------------
  scan_1_frame: {
    key: 'scan_1_frame',
    slug: 'frame.scan-ring',
    name: 'scan ring',
    description: 'unlocked by completing your first scan',
    progressTarget: 1,
  },
  elo_gain_100: {
    key: 'elo_gain_100',
    slug: 'frame.elo-medal',
    name: 'elo medal',
    description: 'unlocked by climbing 100 ELO from base',
    progressTarget: 100,
  },
  streak_7: {
    key: 'streak_7',
    slug: 'frame.streak-pyre',
    name: 'streak pyre',
    description: 'unlocked by a 7-game win streak',
    progressTarget: 7,
  },
  scan_a_tier_frame: {
    key: 'scan_a_tier_frame',
    slug: 'frame.canthal',
    name: 'canthal',
    description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },
  battles_won_25_frame: {
    key: 'battles_won_25_frame',
    slug: 'frame.crown-letters',
    name: 'crown letters',
    description: 'unlocked by winning 25 battles',
    progressTarget: 25,
  },

  // ---- Badges (5) -------------------------------------------------------
  scan_1_badge: {
    key: 'scan_1_badge',
    slug: 'badge.scan-1',
    name: 'first scan',
    description: 'unlocked by completing your first scan',
    progressTarget: 1,
  },
  set_bio_badge: {
    key: 'set_bio_badge',
    slug: 'badge.identity',
    name: 'identity',
    description: 'unlocked by setting your bio',
    progressTarget: 1,
  },
  battles_won_5: {
    key: 'battles_won_5',
    slug: 'badge.duelist',
    name: 'duelist',
    description: 'unlocked by winning 5 battles',
    progressTarget: 5,
  },
  elo_1300: {
    key: 'elo_1300',
    slug: 'badge.king',
    name: 'king',
    description: 'unlocked by reaching 1300 ELO',
    progressTarget: 1300,
  },
  scan_a_tier_badge: {
    key: 'scan_a_tier_badge',
    slug: 'badge.tier-stamp',
    name: 'tier stamp',
    description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },

  // ---- Name FX (5) ------------------------------------------------------
  set_bio_name: {
    key: 'set_bio_name',
    slug: 'name.signed',
    name: 'signed',
    description: 'unlocked by setting your bio',
    progressTarget: 1,
  },
  scan_a_tier_name: {
    key: 'scan_a_tier_name',
    slug: 'name.tier-prefix',
    name: 'tier prefix',
    description: 'unlocked by scanning A-tier or higher',
    progressTarget: 1,
  },
  scan_10: {
    key: 'scan_10',
    slug: 'name.callout',
    name: 'callout',
    description: 'unlocked by completing 10 scans',
    progressTarget: 10,
  },
  win_streak_5: {
    key: 'win_streak_5',
    slug: 'name.streak-flame',
    name: 'streak flame',
    description: 'unlocked by a 5-game win streak',
    progressTarget: 5,
  },
  elo_1500: {
    key: 'elo_1500',
    slug: 'name.elo-king',
    name: 'elo king',
    description: 'unlocked by reaching 1500 ELO',
    progressTarget: 1500,
  },

  // ---- Themes (5) -------------------------------------------------------
  queue_1_battle: {
    key: 'queue_1_battle',
    slug: 'theme.match-found',
    name: 'match found',
    description: 'unlocked by queueing your first battle',
    progressTarget: 1,
  },
  scan_50: {
    key: 'scan_50',
    slug: 'theme.tier-grid',
    name: 'tier grid',
    description: 'unlocked by completing 50 scans',
    progressTarget: 50,
  },
  battles_won_25_theme: {
    key: 'battles_won_25_theme',
    slug: 'theme.win-stack',
    name: 'win stack',
    description: 'unlocked by winning 25 battles',
    progressTarget: 25,
  },
  streak_14: {
    key: 'streak_14',
    slug: 'theme.embers',
    name: 'embers',
    description: 'unlocked by a 14-game win streak',
    progressTarget: 14,
  },
  scan_s_tier: {
    key: 'scan_s_tier',
    slug: 'theme.god-beam',
    name: 'god beam',
    description: 'unlocked by scanning S-tier or higher',
    progressTarget: 1,
  },
};

export type AchievementGrant = {
  achievement_key: string;
  slug: string;
  name: string;
};

/**
 * Check every relevant achievement against the caller's current stats.
 * Returns the list of grants just earned (not previously achieved).
 *
 * Caller passes whichever stats are relevant for the firing context —
 * scan endpoint passes scan-related stats, battle endpoint passes
 * battle stats, etc. Missing stats skip their respective achievements.
 *
 * Multi-grant thresholds (A-tier scan grants 3 items; 25 wins grants
 * 2 items; etc.) are encoded as multiple keys with the same trigger
 * condition — see the calls to `tryGrant` below.
 */
export async function checkAchievements(
  userId: string,
  stats: {
    totalScans?: number;
    bestScanOverall?: number;
    matchesWon?: number;
    elo?: number;
    currentStreak?: number;
    currentWinStreak?: number;
    eloGainedFromBase?: number;
    bioSet?: boolean;
    battleQueued?: boolean;
  },
): Promise<AchievementGrant[]> {
  const pool = getPool();
  const grants: AchievementGrant[] = [];

  const tryGrant = async (def: AchievementCheck, achieved: boolean) => {
    if (!achieved) return;
    // Insert achievement_progress row. xmax = 0 in the returning clause
    // signals a fresh insert (not an update); only those produce a grant
    // + toast.
    const result = await pool.query<{ inserted: boolean }>(
      `insert into achievement_progress (user_id, achievement_key, progress, achieved_at)
         values ($1, $2, $3, now())
         on conflict (user_id, achievement_key) do update
           set achieved_at = coalesce(achievement_progress.achieved_at, now())
         returning xmax = 0 as inserted`,
      [userId, def.key, def.progressTarget],
    );
    const inserted = result.rows[0]?.inserted ?? false;
    if (inserted) {
      await pool.query(
        `insert into user_inventory (user_id, item_slug, source)
           values ($1, $2, 'achievement')
           on conflict (user_id, item_slug) do nothing`,
        [userId, def.slug],
      );
      grants.push({
        achievement_key: def.key,
        slug: def.slug,
        name: def.name,
      });
    }
  };

  // ---- Scan-related ------------------------------------------------------
  if (stats.totalScans != null) {
    await tryGrant(ACHIEVEMENTS.scan_1_frame, stats.totalScans >= 1);
    await tryGrant(ACHIEVEMENTS.scan_1_badge, stats.totalScans >= 1);
    await tryGrant(ACHIEVEMENTS.scan_10, stats.totalScans >= 10);
    await tryGrant(ACHIEVEMENTS.scan_50, stats.totalScans >= 50);
  }
  if (stats.bestScanOverall != null) {
    // A-tier+ at score ≥ 71 (per lib/tier.ts) — grants 3 items at once.
    if (stats.bestScanOverall >= 71) {
      await tryGrant(ACHIEVEMENTS.scan_a_tier_frame, true);
      await tryGrant(ACHIEVEMENTS.scan_a_tier_badge, true);
      await tryGrant(ACHIEVEMENTS.scan_a_tier_name, true);
    }
    // S-tier+ at score ≥ 87.
    if (stats.bestScanOverall >= 87) {
      await tryGrant(ACHIEVEMENTS.scan_s_tier, true);
    }
  }

  // ---- Battle-related ----------------------------------------------------
  if (stats.matchesWon != null) {
    await tryGrant(ACHIEVEMENTS.battles_won_5, stats.matchesWon >= 5);
    // 25-wins grants 2 items at once (frame + theme).
    await tryGrant(ACHIEVEMENTS.battles_won_25_frame, stats.matchesWon >= 25);
    await tryGrant(ACHIEVEMENTS.battles_won_25_theme, stats.matchesWon >= 25);
  }
  if (stats.elo != null) {
    await tryGrant(ACHIEVEMENTS.elo_1300, stats.elo >= 1300);
    await tryGrant(ACHIEVEMENTS.elo_1500, stats.elo >= 1500);
  }
  if (stats.eloGainedFromBase != null) {
    await tryGrant(ACHIEVEMENTS.elo_gain_100, stats.eloGainedFromBase >= 100);
  }
  if (stats.currentWinStreak != null) {
    await tryGrant(ACHIEVEMENTS.win_streak_5, stats.currentWinStreak >= 5);
  }
  if (stats.currentStreak != null) {
    await tryGrant(ACHIEVEMENTS.streak_7, stats.currentStreak >= 7);
    await tryGrant(ACHIEVEMENTS.streak_14, stats.currentStreak >= 14);
  }

  // ---- Profile-related ---------------------------------------------------
  // Bio set grants 2 items at once (badge + name fx).
  if (stats.bioSet === true) {
    await tryGrant(ACHIEVEMENTS.set_bio_badge, true);
    await tryGrant(ACHIEVEMENTS.set_bio_name, true);
  }
  if (stats.battleQueued === true) {
    await tryGrant(ACHIEVEMENTS.queue_1_battle, true);
  }

  return grants;
}
