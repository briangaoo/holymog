import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Window = '1 s' | '10 s' | '1 m' | '10 m' | '1 h' | '1 d';

type Preset = {
  tokens: number;
  window: Window;
};

/**
 * Named rate-limit presets. Each gets its own Redis prefix so buckets are
 * isolated even when keys collide across endpoints. All limits gracefully
 * degrade to "no limit" when Upstash credentials aren't configured (local
 * dev). Tune values here, not at the call site, so policy is one place.
 */
const PRESETS = {
  default: { tokens: 10, window: '1 m' },
  // Live-meter calls during a scan — fires ~5 per scan flow legitimately.
  quickScore: { tokens: 60, window: '1 m' },
  // Battle frame scoring — natural rate is ~10 / 11s active window per user.
  battleScore: { tokens: 30, window: '1 m' },
  // Code-guess + private join attempts.
  battleJoin: { tokens: 20, window: '1 m' },
  // Username changes — friction on enumeration / churn.
  username: { tokens: 3, window: '1 h' },
  // General account-mutation gate (avatar uploads, deletes, etc).
  accountMutate: { tokens: 20, window: '1 m' },
  // Avatar / banner uploads — sharp re-encode is cheap but storage
  // writes aren't, and we want abuse pressure low here so a single
  // user can't fill the bucket churning new avatars.
  accountAvatar: { tokens: 5, window: '1 h' },
  // Leaderboard submission — server-validated scans take ~$0.01 of
  // Gemini budget each; bounding submissions at 5/h per user caps
  // the abuse cost ceiling.
  leaderboardSubmit: { tokens: 5, window: '1 h' },
  // Private battle creation — 10/h per host prevents code-spam abuse
  // (each create burns a Crockford code from the keyspace and creates
  // an idle LiveKit room).
  battleCreate: { tokens: 10, window: '1 h' },
  // Post-match reports against a public-1v1 opponent. Server-side
  // dedupes on (battle_id, reporter, reported) anyway; this caps a
  // spam burst from a single user filing dozens of reports.
  battleReport: { tokens: 10, window: '1 h' },
} as const satisfies Record<string, Preset>;

export type RatelimitName = keyof typeof PRESETS;

const cache = new Map<RatelimitName, Ratelimit>();

export function getRatelimit(name: RatelimitName = 'default'): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const cached = cache.get(name);
  if (cached) return cached;
  const cfg = PRESETS[name];
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
    analytics: true,
    prefix: `holymog:${name}`,
  });
  cache.set(name, limiter);
  return limiter;
}
