import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { isSubscriber } from '@/lib/subscription';

const ANON_LIFETIME_LIMIT = 1;
export const AUTH_DAILY_LIMIT = 30;
/** Signed-in users see a one-time warning toast once their used count
 *  crosses this threshold — 5 scans before the daily cap. The threshold
 *  is exposed so /api/scan/check + the client toast logic agree on the
 *  same trigger point. */
export const AUTH_DAILY_WARNING_THRESHOLD = 25;
const ANON_IP_DAILY_LIMIT = 3;

/**
 * LAUNCH-1 growth mode. When `true`, both the read-only check and the
 * atomic check-and-record paths return "unlimited / allowed" without
 * counting against any quota. scan_attempts rows are still inserted
 * (so analytics still work + rollbackScanAttempt() still has something
 * to delete on failure) — only the gate is bypassed.
 *
 * The whole point of this constant is to let people scan as much as
 * they want during the launch window when Brian has $300 of free
 * Gemini credit to spend on growth. Flip back to `false` to re-engage
 * the 1-lifetime anon, 30-day auth, and 3-day-per-IP caps.
 *
 * The UI consumers (app/scan/page.tsx, ScanPaywall) read `allowed`
 * + `used` + `limit` and already do the right thing with the
 * sentinel `limit: -1` we return here — paywall never fires,
 * "X scans left today" warning never shows.
 */
const LIMITS_DISABLED = true;

function unlimitedState(signedIn: boolean): ScanLimitState {
  return {
    allowed: true,
    used: 0,
    // -1 is the same "unlimited" sentinel the subscriber branch
    // already returns, so any UI reading `state.limit` to display
    // "X scans left" naturally short-circuits the chip.
    limit: -1,
    signedIn,
    reason: null,
    resetInSeconds: null,
  };
}

export type ScanLimitInput = {
  userId: string | null;
  anonId: string | null;
  ip: string;
};

export type ScanLimitState = {
  allowed: boolean;
  used: number;
  limit: number;
  signedIn: boolean;
  reason: 'anon_lifetime' | 'auth_daily' | 'anon_ip_daily' | null;
  /** Seconds until the soonest reset, when applicable. Null for anon_lifetime. */
  resetInSeconds: number | null;
};

export type ScanAttemptResult = {
  state: ScanLimitState;
  /** Row id of the inserted scan_attempt — pass to rollbackScanAttempt() if the
   *  downstream Vertex call fails so the user doesn't get charged a quota
   *  point for a scan that never returned a score. Null when not allowed. */
  attemptId: string | null;
};

function hashIp(ip: string): string {
  return crypto
    .createHash('sha256')
    .update((process.env.AUTH_SECRET ?? '') + ip)
    .digest('hex');
}

// Tight enough to reject obvious garbage / spoof attempts. Final string is
// only ever HMAC-hashed before storage, so even a malformed value can't
// cause SQL injection — but a valid-looking value reduces noise in
// downstream rate-limit buckets.
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

function looksLikeIp(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value);
}

export function readClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first && looksLikeIp(first)) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real && looksLikeIp(real)) return real;
  return '0.0.0.0';
}

/**
 * Read-only quota check. Used by /api/scan/check to drive the UI's "X scans
 * left" indicator. NOT authoritative — the source of truth is attemptScan(),
 * which inserts-and-validates atomically under per-key advisory locks.
 */
export async function checkScanLimit(input: ScanLimitInput): Promise<ScanLimitState> {
  if (LIMITS_DISABLED) return unlimitedState(!!input.userId);

  const pool = getPool();

  if (input.userId && (await isSubscriber(input.userId))) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      signedIn: true,
      reason: null,
      resetInSeconds: null,
    };
  }

  if (input.userId) {
    const { rows } = await pool.query<{ c: number; oldest: Date | null }>(
      `select count(*)::int as c,
              min(created_at) as oldest
         from scan_attempts
        where user_id = $1
          and created_at > now() - interval '24 hours'`,
      [input.userId],
    );
    const used = rows[0]?.c ?? 0;
    const oldest = rows[0]?.oldest ?? null;
    const allowed = used < AUTH_DAILY_LIMIT;
    let resetInSeconds: number | null = null;
    if (!allowed && oldest) {
      const resetAt = oldest.getTime() + 24 * 60 * 60 * 1000;
      resetInSeconds = Math.max(0, Math.floor((resetAt - Date.now()) / 1000));
    }
    return {
      allowed,
      used,
      limit: AUTH_DAILY_LIMIT,
      signedIn: true,
      reason: allowed ? null : 'auth_daily',
      resetInSeconds,
    };
  }

  const ipHash = hashIp(input.ip);
  let used = 0;

  if (input.anonId) {
    const { rows } = await pool.query<{ c: number }>(
      `select count(*)::int as c from scan_attempts where anon_id = $1`,
      [input.anonId],
    );
    used = rows[0]?.c ?? 0;
    if (used >= ANON_LIFETIME_LIMIT) {
      return {
        allowed: false,
        used,
        limit: ANON_LIFETIME_LIMIT,
        signedIn: false,
        reason: 'anon_lifetime',
        resetInSeconds: null,
      };
    }
  }

  const { rows: ipRows } = await pool.query<{ c: number; oldest: Date | null }>(
    `select count(*)::int as c, min(created_at) as oldest
       from scan_attempts
      where ip_hash = $1
        and user_id is null
        and created_at > now() - interval '24 hours'`,
    [ipHash],
  );
  const ipDailyUsed = ipRows[0]?.c ?? 0;
  if (ipDailyUsed >= ANON_IP_DAILY_LIMIT) {
    const oldest = ipRows[0]?.oldest;
    const resetInSeconds = oldest
      ? Math.max(0, Math.floor((oldest.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000))
      : null;
    return {
      allowed: false,
      used: ipDailyUsed,
      limit: ANON_IP_DAILY_LIMIT,
      signedIn: false,
      reason: 'anon_ip_daily',
      resetInSeconds,
    };
  }

  return {
    allowed: true,
    used,
    limit: ANON_LIFETIME_LIMIT,
    signedIn: false,
    reason: null,
    resetInSeconds: null,
  };
}

/**
 * Atomic check-and-record. Serializes concurrent attempts against the same
 * user/anon/ip via transaction-scoped advisory locks, then runs the count
 * inside that transaction and inserts the attempt row before commit. Closes
 * the check-then-record TOCTOU race that the previous two-call API
 * (checkScanLimit + recordScanAttempt) exposed.
 *
 * Returns `attemptId` when allowed so the caller can call
 * rollbackScanAttempt() if Vertex itself fails — keeps the
 * failed-scans-don't-count UX intact.
 */
export async function attemptScan(input: ScanLimitInput): Promise<ScanAttemptResult> {
  // Subscribers bypass entirely — no lock, no insert, unlimited.
  if (input.userId && (await isSubscriber(input.userId))) {
    return {
      state: {
        allowed: true,
        used: 0,
        limit: -1,
        signedIn: true,
        reason: null,
        resetInSeconds: null,
      },
      attemptId: null,
    };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await acquireLocks(client, input);

    const state = await computeStateLocked(client, input);
    let attemptId: string | null = null;
    if (state.allowed) {
      const { rows } = await client.query<{ id: string }>(
        `insert into scan_attempts (user_id, anon_id, ip_hash)
              values ($1, $2, $3)
           returning id`,
        [input.userId, input.anonId, hashIp(input.ip)],
      );
      attemptId = rows[0]?.id ?? null;
    }
    await client.query('commit');
    return { state, attemptId };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Undo a previously-recorded scan attempt. Called when the Vertex call
 * downstream of attemptScan() failed, so the user's quota is restored.
 * Best-effort: a DELETE failure logs and moves on — quota will simply
 * count this attempt against the user, which is harmless.
 */
export async function rollbackScanAttempt(attemptId: string): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(`delete from scan_attempts where id = $1`, [attemptId]);
  } catch (err) {
    console.error('[scanLimit] rollback failed', { attemptId, err });
  }
}

async function acquireLocks(client: PoolClient, input: ScanLimitInput): Promise<void> {
  // pg_advisory_xact_lock releases on commit/rollback. hashtext()::int8 packs
  // a stable per-key fingerprint into the bigint slot the function expects.
  // Lock-acquisition order is stable (auth path locks one key; anon path locks
  // anon-key before ip-key) so concurrent attempts can't deadlock against each
  // other.
  if (input.userId) {
    await client.query(
      `select pg_advisory_xact_lock(hashtext('scan_attempt:user:' || $1)::int8)`,
      [input.userId],
    );
    return;
  }
  if (input.anonId) {
    await client.query(
      `select pg_advisory_xact_lock(hashtext('scan_attempt:anon:' || $1)::int8)`,
      [input.anonId],
    );
  }
  await client.query(
    `select pg_advisory_xact_lock(hashtext('scan_attempt:ip:' || $1)::int8)`,
    [hashIp(input.ip)],
  );
}

async function computeStateLocked(
  client: PoolClient,
  input: ScanLimitInput,
): Promise<ScanLimitState> {
  if (LIMITS_DISABLED) return unlimitedState(!!input.userId);

  if (input.userId) {
    const { rows } = await client.query<{ c: number; oldest: Date | null }>(
      `select count(*)::int as c, min(created_at) as oldest
         from scan_attempts
        where user_id = $1
          and created_at > now() - interval '24 hours'`,
      [input.userId],
    );
    const used = rows[0]?.c ?? 0;
    const oldest = rows[0]?.oldest ?? null;
    const allowed = used < AUTH_DAILY_LIMIT;
    let resetInSeconds: number | null = null;
    if (!allowed && oldest) {
      resetInSeconds = Math.max(
        0,
        Math.floor((oldest.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000),
      );
    }
    return {
      allowed,
      used,
      limit: AUTH_DAILY_LIMIT,
      signedIn: true,
      reason: allowed ? null : 'auth_daily',
      resetInSeconds,
    };
  }

  const ipHash = hashIp(input.ip);
  let used = 0;

  if (input.anonId) {
    const { rows } = await client.query<{ c: number }>(
      `select count(*)::int as c from scan_attempts where anon_id = $1`,
      [input.anonId],
    );
    used = rows[0]?.c ?? 0;
    if (used >= ANON_LIFETIME_LIMIT) {
      return {
        allowed: false,
        used,
        limit: ANON_LIFETIME_LIMIT,
        signedIn: false,
        reason: 'anon_lifetime',
        resetInSeconds: null,
      };
    }
  }

  const { rows: ipRows } = await client.query<{ c: number; oldest: Date | null }>(
    `select count(*)::int as c, min(created_at) as oldest
       from scan_attempts
      where ip_hash = $1
        and user_id is null
        and created_at > now() - interval '24 hours'`,
    [ipHash],
  );
  const ipDailyUsed = ipRows[0]?.c ?? 0;
  if (ipDailyUsed >= ANON_IP_DAILY_LIMIT) {
    const oldest = ipRows[0]?.oldest;
    const resetInSeconds = oldest
      ? Math.max(
          0,
          Math.floor((oldest.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000),
        )
      : null;
    return {
      allowed: false,
      used: ipDailyUsed,
      limit: ANON_IP_DAILY_LIMIT,
      signedIn: false,
      reason: 'anon_ip_daily',
      resetInSeconds,
    };
  }

  return {
    allowed: true,
    used,
    limit: ANON_LIFETIME_LIMIT,
    signedIn: false,
    reason: null,
    resetInSeconds: null,
  };
}
