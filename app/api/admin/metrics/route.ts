import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { getRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Site-wide totals for the admin dashboard. All counts come from
 * the primary Postgres so they reflect the canonical state, not
 * any cache. Today-only counters use the database's UTC midnight
 * as the day boundary — admin glance, not analytics, so timezone
 * approximation is fine here.
 *
 * Queries are issued in parallel because none depend on each other.
 * Each is a single indexed count; the heaviest one is
 * scan_history which is bounded by the prune-old-data cron at 90d.
 */
type Metrics = {
  total_users: number;
  signups_today: number;
  total_scans: number;
  scans_today: number;
  total_battles: number;
  battles_today: number;
  total_subscribers: number;
  leaderboard_total: number;
  pending_reports: number;
  banned_users: number;
};

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:metrics:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  const pool = getPool();
  // One round-trip per metric. We could collapse into a single
  // big CTE but the parallel fan-out is simpler to read + each
  // count hits its own index, so total wall time is still ~1 RTT.
  const [
    users,
    signupsToday,
    scans,
    scansToday,
    battles,
    battlesToday,
    subs,
    lb,
    pending,
    banned,
  ] = await Promise.all([
    pool.query<{ c: string }>('select count(*)::text as c from users'),
    // profiles.created_at is set by our `events.createUser` Auth.js
    // hook the moment the user row lands, so it's a 1:1 stand-in for
    // signup time and avoids us depending on pg-adapter's internal
    // users table column naming.
    pool.query<{ c: string }>(
      "select count(*)::text as c from profiles where created_at >= date_trunc('day', now())",
    ),
    pool.query<{ c: string }>('select count(*)::text as c from scan_history'),
    pool.query<{ c: string }>(
      "select count(*)::text as c from scan_history where created_at >= date_trunc('day', now())",
    ),
    pool.query<{ c: string }>('select count(*)::text as c from battles'),
    pool.query<{ c: string }>(
      "select count(*)::text as c from battles where created_at >= date_trunc('day', now())",
    ),
    pool.query<{ c: string }>(
      "select count(*)::text as c from profiles where subscription_status in ('active','trialing')",
    ),
    pool.query<{ c: string }>('select count(*)::text as c from leaderboard'),
    pool.query<{ c: string }>(
      "select count(*)::text as c from battle_reports where state = 'pending'",
    ),
    pool.query<{ c: string }>(
      'select count(*)::text as c from profiles where banned_at is not null',
    ),
  ]);

  const out: Metrics = {
    total_users: Number(users.rows[0]?.c ?? 0),
    signups_today: Number(signupsToday.rows[0]?.c ?? 0),
    total_scans: Number(scans.rows[0]?.c ?? 0),
    scans_today: Number(scansToday.rows[0]?.c ?? 0),
    total_battles: Number(battles.rows[0]?.c ?? 0),
    battles_today: Number(battlesToday.rows[0]?.c ?? 0),
    total_subscribers: Number(subs.rows[0]?.c ?? 0),
    leaderboard_total: Number(lb.rows[0]?.c ?? 0),
    pending_reports: Number(pending.rows[0]?.c ?? 0),
    banned_users: Number(banned.rows[0]?.c ?? 0),
  };

  return NextResponse.json(out);
}
