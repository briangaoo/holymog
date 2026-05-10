import crypto from 'crypto';
import { getPool } from '@/lib/db';
import { isSubscriber } from '@/lib/subscription';

const ANON_LIFETIME_LIMIT = 1;
const AUTH_DAILY_LIMIT = 10;
const ANON_IP_DAILY_LIMIT = 3;

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

export async function checkScanLimit(input: ScanLimitInput): Promise<ScanLimitState> {
  const pool = getPool();

  // holymog+ subscribers bypass the daily limit entirely.
  if (input.userId && (await isSubscriber(input.userId))) {
    return {
      allowed: true,
      used: 0,
      limit: -1, // -1 signals unlimited to the client
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

  // Anon path: lifetime cookie limit + IP-keyed daily fence.
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

  // IP fence catches users clearing cookies to bypass the lifetime limit.
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

export async function recordScanAttempt(input: ScanLimitInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into scan_attempts (user_id, anon_id, ip_hash) values ($1, $2, $3)`,
    [input.userId, input.anonId, hashIp(input.ip)],
  );
}
