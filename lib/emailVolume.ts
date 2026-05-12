import { Redis } from '@upstash/redis';

/**
 * Outbound-email volume telemetry. Used by /api/cron/email-volume-check
 * to detect when sustained sending crosses ~75% of the Gmail Workspace
 * SMTP 2,000/day cap and we should swap to Resend before magic links
 * start getting throttled.
 *
 * Backed by a per-UTC-day Upstash counter. Fire-and-forget on the
 * write side — failure to record telemetry never blocks the actual
 * email send. Dev mode without Upstash configured silently no-ops.
 */

const KEY_PREFIX = 'holymog:email-count';
const ALERT_KEY_PREFIX = 'holymog:email-volume-alerted';
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

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

function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Increment today's email-sent counter. Best-effort: errors are
 * swallowed so a Redis blip can never cascade into a failed
 * transactional send.
 */
export async function recordEmailSent(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = `${KEY_PREFIX}:${dateKey()}`;
    await redis.incr(key);
    await redis.expire(key, RETENTION_SECONDS);
  } catch (err) {
    console.error('[emailVolume] record failed', err);
  }
}

/**
 * Read the email count for `daysAgo` UTC days ago (0 = today, 1 =
 * yesterday, etc). Returns 0 when unset or when Redis is unavailable.
 */
export async function getEmailCount(daysAgo: number): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  try {
    const raw = await redis.get(`${KEY_PREFIX}:${dateKey(d)}`);
    return typeof raw === 'number' ? raw : Number(raw ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Has the alert already been sent today? Used to dedupe — cron may
 * fire more than once per UTC day and we only want one alert email.
 */
export async function hasAlertedToday(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const raw = await redis.get(`${ALERT_KEY_PREFIX}:${dateKey()}`);
    return Boolean(raw);
  } catch {
    return false;
  }
}

/**
 * Mark today's alert as sent. 24h TTL so the flag clears naturally
 * at the next UTC midnight.
 */
export async function markAlerted(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`${ALERT_KEY_PREFIX}:${dateKey()}`, '1', {
      ex: 24 * 60 * 60,
    });
  } catch (err) {
    console.error('[emailVolume] markAlerted failed', err);
  }
}
