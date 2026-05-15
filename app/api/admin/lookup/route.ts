import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin user-lookup endpoint. Returns a dossier for one user. Search
 * accepts a display_name (with or without leading @), a verified email
 * address, or a raw user_id UUID. First exact match wins; ambiguity is
 * resolved by the order user_id → email → display_name.
 *
 * Stealth: caller without admin credentials gets the same 404 a
 * non-existent endpoint would. Origin / rate-limit checks come after
 * the admin check so they can't be used as an oracle either.
 */

type LookupBody = {
  query?: unknown;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  banned_at: Date | null;
  banned_reason: string | null;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  best_scan_overall: number | null;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  subscription_status: string | null;
  created_at: Date;
  updated_at: Date | null;
};

type ScanRow = {
  id: string;
  overall: number;
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
  created_at: Date;
};

type AuditRow = {
  id: string;
  action: string;
  resource: string | null;
  metadata: unknown;
  created_at: Date;
};

type LeaderboardRow = {
  id: string;
  overall: number;
  image_url: string | null;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const guard = requireSameOrigin(request);
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:lookup:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const raw = typeof body.query === 'string' ? body.query.trim() : '';
  if (!raw) {
    return NextResponse.json({ error: 'missing_query' }, { status: 400 });
  }

  // Strip leading @ for username queries — admin console sends it
  // pre-stripped but be lenient if the operator pastes one in by hand.
  const normalized = raw.replace(/^@/, '');

  const pool = getPool();

  // Resolve to a user_id by trying UUID, email, then display_name (case-
  // insensitive). Each lookup is a single indexed query.
  let userId: string | null = null;
  if (UUID_RE.test(normalized)) {
    userId = normalized.toLowerCase();
  } else if (normalized.includes('@')) {
    const r = await pool.query<{ id: string }>(
      'select id from users where lower(email) = lower($1) limit 1',
      [normalized],
    );
    userId = r.rows[0]?.id ?? null;
  } else {
    const r = await pool.query<{ user_id: string }>(
      'select user_id from profiles where lower(display_name) = lower($1) limit 1',
      [normalized],
    );
    userId = r.rows[0]?.user_id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ kind: 'not_found' as const });
  }

  const profileResult = await pool.query<ProfileRow>(
    `select
       p.user_id, p.display_name,
       u.email,
       p.banned_at, p.banned_reason,
       p.elo, p.peak_elo,
       p.matches_played, p.matches_won,
       p.best_scan_overall,
       p.hide_photo_from_leaderboard, p.hide_elo,
       p.subscription_status,
       p.created_at, p.updated_at
       from profiles p
       join users u on u.id = p.user_id
      where p.user_id = $1
      limit 1`,
    [userId],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    return NextResponse.json({ kind: 'not_found' as const });
  }

  const supabase = getSupabaseAdmin();
  const [scans, audit, sessions, leaderboardRows] = await Promise.all([
    pool.query<ScanRow>(
      `select id, overall, jawline, eyes, skin, cheekbones, created_at
         from scan_history
        where user_id = $1
        order by created_at desc
        limit 50`,
      [userId],
    ),
    pool.query<AuditRow>(
      `select id, action, resource, metadata, created_at
         from audit_log
        where user_id = $1
        order by created_at desc
        limit 30`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `select count(*)::int as count from sessions where "userId" = $1`,
      [userId],
    ),
    supabase
      ? supabase
          .from('leaderboard')
          .select('id, overall, image_url, created_at')
          .eq('user_id', userId)
          .limit(1)
      : Promise.resolve({ data: [] as LeaderboardRow[], error: null }),
  ]);

  const leaderboardRow =
    'data' in leaderboardRows && Array.isArray(leaderboardRows.data)
      ? (leaderboardRows.data[0] as LeaderboardRow | undefined) ?? null
      : null;

  return NextResponse.json({
    kind: 'found' as const,
    user: {
      user_id: profile.user_id,
      display_name: profile.display_name,
      email: profile.email,
      banned_at: profile.banned_at?.toISOString() ?? null,
      banned_reason: profile.banned_reason,
      elo: profile.elo,
      peak_elo: profile.peak_elo,
      matches_played: profile.matches_played,
      matches_won: profile.matches_won,
      best_scan_overall: profile.best_scan_overall,
      hide_photo_from_leaderboard: profile.hide_photo_from_leaderboard,
      hide_elo: profile.hide_elo,
      subscription_status: profile.subscription_status,
      created_at: profile.created_at.toISOString(),
      updated_at: profile.updated_at?.toISOString() ?? null,
      active_sessions: sessions.rows[0]?.count ?? 0,
    },
    leaderboard: leaderboardRow,
    scans: scans.rows.map((s) => ({
      id: s.id,
      overall: s.overall,
      jawline: s.jawline,
      eyes: s.eyes,
      skin: s.skin,
      cheekbones: s.cheekbones,
      created_at: s.created_at.toISOString(),
    })),
    audit: audit.rows.map((a) => ({
      id: a.id,
      action: a.action,
      resource: a.resource,
      metadata: a.metadata,
      created_at: a.created_at.toISOString(),
    })),
  });
}
