import { Redis } from '@upstash/redis';

/**
 * Daily Gemini spend cap.
 *
 * Tracks cumulative USD spent today in an Upstash counter keyed by
 * the UTC date. Every Gemini call increments the counter. The
 * pre-call check rejects if usage has crossed
 * `DAILY_GEMINI_BUDGET_USD` (default $30 — ~10K full scans/day).
 *
 * This is the hard ceiling that bounds cost-attack risk. Origin
 * guard (Phase 11) is the cheap first line; the budget cap is the
 * load-bearing one. Even if an attacker bypasses Origin via a
 * custom backend, they can only burn up to today's budget before
 * everything halts until 00:00 UTC.
 *
 * Dev / no-Upstash mode: returns ok:true unconditionally. Local
 * scanning still works without Upstash configured; the cap is a
 * production-only safety net.
 */

// Gemini 2.5 Flash Lite pricing (May 2026).
const PRICE_INPUT_PER_M = 0.1;
const PRICE_OUTPUT_PER_M = 0.4;

const KEY_PREFIX = 'holymog:gemini-cost';

function dayKey(): string {
  return `${KEY_PREFIX}:${new Date().toISOString().slice(0, 10)}`;
}

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  cachedRedis = Redis.fromEnv();
  return cachedRedis;
}

export type BudgetState =
  | { ok: true; usage: number; cap: number }
  | { ok: false; usage: number; cap: number };

/**
 * Pre-call gate. Returns `{ ok: false }` when today's spend has
 * crossed the configured cap. Callers should return a 503
 * `system_unavailable` in that case.
 */
export async function checkBudget(): Promise<BudgetState> {
  const cap = Number(process.env.DAILY_GEMINI_BUDGET_USD ?? '30');
  const redis = getRedis();
  if (!redis) return { ok: true, usage: 0, cap };
  try {
    const raw = await redis.get(dayKey());
    const usage = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return { ok: usage < cap, usage, cap };
  } catch {
    // Upstash blip: fail open. Logging here would just amplify noise
    // since recordCost will also fail. The rate limiters provide
    // partial backpressure in this case.
    return { ok: true, usage: 0, cap };
  }
}

/**
 * Post-call accounting. Best-effort — failures don't block scoring
 * responses. Increments the day-key and refreshes a 7-day TTL so
 * stale day-keys auto-evict (we don't need history beyond ~a week).
 */
export async function recordCost(
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const cost =
    (inputTokens * PRICE_INPUT_PER_M +
      outputTokens * PRICE_OUTPUT_PER_M) /
    1_000_000;
  if (cost <= 0) return;
  try {
    const key = dayKey();
    await redis.incrbyfloat(key, cost);
    await redis.expire(key, 86400 * 7);
  } catch {
    // best-effort
  }
}
