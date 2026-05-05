import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let cachedLimiter: Ratelimit | null = null;

export function getRatelimit(): Ratelimit | null {
  if (cachedLimiter) return cachedLimiter;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  cachedLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: true,
    prefix: 'mogem',
  });
  return cachedLimiter;
}
