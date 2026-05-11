import { getPool } from '@/lib/db';

/**
 * Achievement engine — Launch 1.
 *
 * Grants 21 cosmetic items (11 tier badges + 10 name fx). No monetization;
 * everything is earned via gameplay. Frames + themes are deferred to
 * Launch 2 with real designers.
 *
 * Tier badges follow a cumulative rule: when you scan at tier X, every
 * badge for tiers X and below unlocks. Scanning S+ on your first scan
 * unlocks all 11 at once. The user picks which one to display from
 * settings — including a lower one for irony.
 *
 * `checkAchievements(userId, stats)` is idempotent — re-firing for the
 * same threshold is a no-op (ON CONFLICT DO NOTHING in user_inventory).
 * Returns only the grants that landed this call so the client can toast
 * them.
 */

export type AchievementCheck = {
  key: string;
  slug: string;
  name: string;
  description: string;
};

export const ACHIEVEMENTS: Record<string, AchievementCheck> = {
  // ---- Tier badges (11) — cumulative on scan score ----------------------
  scan_tier_ugly_af: {
    key: 'scan_tier_ugly_af',
    slug: 'badge.ugly-af',
    name: 'ugly af',
    description: 'F- scan',
  },
  scan_tier_subhuman: {
    key: 'scan_tier_subhuman',
    slug: 'badge.subhuman',
    name: 'subhuman',
    description: 'F scan',
  },
  scan_tier_chopped: {
    key: 'scan_tier_chopped',
    slug: 'badge.chopped',
    name: 'chopped',
    description: 'F+ scan',
  },
  scan_tier_low_normie: {
    key: 'scan_tier_low_normie',
    slug: 'badge.low-normie',
    name: 'low-tier normie',
    description: 'D-tier scan',
  },
  scan_tier_normie: {
    key: 'scan_tier_normie',
    slug: 'badge.normie',
    name: 'normie',
    description: 'C-tier scan',
  },
  scan_tier_high_normie: {
    key: 'scan_tier_high_normie',
    slug: 'badge.high-normie',
    name: 'high-tier normie',
    description: 'B-tier scan',
  },
  scan_tier_chadlite: {
    key: 'scan_tier_chadlite',
    slug: 'badge.chadlite',
    name: 'chadlite',
    description: 'A-tier scan',
  },
  scan_tier_mogger: {
    key: 'scan_tier_mogger',
    slug: 'badge.mogger',
    name: 'mogger',
    description: 'A+ scan',
  },
  scan_tier_chad: {
    key: 'scan_tier_chad',
    slug: 'badge.chad',
    name: 'chad',
    description: 'S- scan',
  },
  scan_tier_heartbreaker: {
    key: 'scan_tier_heartbreaker',
    slug: 'badge.heartbreaker',
    name: 'heartbreaker',
    description: 'S scan',
  },
  scan_tier_true_adam_badge: {
    key: 'scan_tier_true_adam_badge',
    slug: 'badge.true-adam',
    name: 'true adam',
    description: 'S+ scan',
  },

  // ---- Name fx (10) -----------------------------------------------------
  scan_1: {
    key: 'scan_1',
    slug: 'name.signed',
    name: 'signed',
    description: 'first scan',
  },
  scan_10: {
    key: 'scan_10',
    slug: 'name.callout',
    name: 'callout',
    description: '10 scans',
  },
  scan_b_tier: {
    key: 'scan_b_tier',
    slug: 'name.tier-prefix',
    name: 'tier prefix',
    description: 'B-tier scan or higher',
  },
  streak_7: {
    key: 'streak_7',
    slug: 'name.streak-flame',
    name: 'streak flame',
    description: '7-day streak',
  },
  scan_s_tier_holo: {
    key: 'scan_s_tier_holo',
    slug: 'name.holographic',
    name: 'holographic',
    description: 'S-tier scan or higher',
  },
  battles_won_25: {
    key: 'battles_won_25',
    slug: 'name.neon',
    name: 'neon',
    description: '25 battle wins',
  },
  elo_1500: {
    key: 'elo_1500',
    slug: 'name.elo-king',
    name: 'elo king',
    description: '1500 ELO',
  },
  elo_1700: {
    key: 'elo_1700',
    slug: 'name.gilded',
    name: 'gilded',
    description: '1700 ELO',
  },
  streak_30: {
    key: 'streak_30',
    slug: 'name.divine',
    name: 'divine',
    description: '30-day streak',
  },
  scan_s_plus: {
    key: 'scan_s_plus',
    slug: 'name.true-adam',
    name: 'true adam',
    description: 'S+ scan',
  },
};

/**
 * Cumulative tier-badge thresholds. Index = lowest overall score that
 * unlocks this key. Walked in ascending order; every key whose threshold
 * is ≤ score gets granted (idempotently). Matches lib/tier.ts bands.
 */
const TIER_BADGE_THRESHOLDS: ReadonlyArray<readonly [number, string]> = [
  [0, 'scan_tier_ugly_af'],
  [10, 'scan_tier_subhuman'],
  [18, 'scan_tier_chopped'],
  [26, 'scan_tier_low_normie'],
  [41, 'scan_tier_normie'],
  [56, 'scan_tier_high_normie'],
  [71, 'scan_tier_chadlite'],
  [82, 'scan_tier_mogger'],
  [87, 'scan_tier_chad'],
  [90, 'scan_tier_heartbreaker'],
  [94, 'scan_tier_true_adam_badge'],
];

export type AchievementGrant = {
  achievement_key: string;
  slug: string;
  name: string;
};

/**
 * Idempotent achievement check. Insert achievement_progress + the
 * matching inventory row, return the grant only when this call is the
 * first time the user crossed that threshold (xmax = 0 sentinel).
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
  },
): Promise<AchievementGrant[]> {
  const pool = getPool();
  const grants: AchievementGrant[] = [];

  const tryGrant = async (key: string, achieved: boolean) => {
    const def = ACHIEVEMENTS[key];
    if (!def || !achieved) return;
    const result = await pool.query<{ inserted: boolean }>(
      `insert into achievement_progress (user_id, achievement_key, progress, achieved_at)
         values ($1, $2, 1, now())
         on conflict (user_id, achievement_key) do update
           set achieved_at = coalesce(achievement_progress.achieved_at, now())
         returning xmax = 0 as inserted`,
      [userId, def.key],
    );
    const inserted = result.rows[0]?.inserted ?? false;
    if (!inserted) return;
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
  };

  // ---- Tier-badge cascade (cumulative on bestScanOverall) ----
  if (stats.bestScanOverall != null) {
    const score = stats.bestScanOverall;
    for (const [threshold, key] of TIER_BADGE_THRESHOLDS) {
      if (score >= threshold) {
        await tryGrant(key, true);
      }
    }
  }

  // ---- Scan-count name fx ----
  if (stats.totalScans != null) {
    await tryGrant('scan_1', stats.totalScans >= 1);
    await tryGrant('scan_10', stats.totalScans >= 10);
  }

  // ---- Score-band name fx ----
  if (stats.bestScanOverall != null) {
    await tryGrant('scan_b_tier', stats.bestScanOverall >= 56);
    await tryGrant('scan_s_tier_holo', stats.bestScanOverall >= 87);
    await tryGrant('scan_s_plus', stats.bestScanOverall >= 94);
  }

  // ---- Battle name fx ----
  if (stats.matchesWon != null) {
    await tryGrant('battles_won_25', stats.matchesWon >= 25);
  }
  if (stats.elo != null) {
    await tryGrant('elo_1500', stats.elo >= 1500);
    await tryGrant('elo_1700', stats.elo >= 1700);
  }

  // ---- Streak name fx ----
  const streak = stats.currentStreak ?? stats.currentWinStreak ?? null;
  if (streak != null) {
    await tryGrant('streak_7', streak >= 7);
    await tryGrant('streak_30', streak >= 30);
  }

  return grants;
}
