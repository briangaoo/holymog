import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { getRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pending battle_reports queue for the admin console. Returns up to
 * MAX_LIMIT rows in oldest-first order so the oldest unresolved
 * complaint sits at the top of the queue.
 *
 * Joins:
 *   - reporter_user_id and reported_user_id against `profiles` to
 *     surface display_names (raw uuids are useless for triage)
 *   - leaves the battle_id intact for cross-reference into the
 *     /api/battle history if the operator needs deeper context
 */

type ReportRow = {
  id: string;
  battle_id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reporter_name: string | null;
  reported_name: string | null;
  reported_banned_at: Date | null;
  reason: string;
  details: string | null;
  created_at: Date;
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:reports:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(MAX_LIMIT, limitParam)
    : DEFAULT_LIMIT;

  const pool = getPool();
  const r = await pool.query<ReportRow>(
    `select
       br.id, br.battle_id, br.reporter_user_id, br.reported_user_id,
       reporter.display_name as reporter_name,
       reported.display_name as reported_name,
       reported.banned_at as reported_banned_at,
       br.reason, br.details, br.created_at
       from battle_reports br
       left join profiles reporter on reporter.user_id = br.reporter_user_id
       left join profiles reported on reported.user_id = br.reported_user_id
      where br.state = 'pending'
      order by br.created_at asc
      limit $1`,
    [limit],
  );

  return NextResponse.json({
    entries: r.rows.map((row) => ({
      id: row.id,
      battle_id: row.battle_id,
      reporter_user_id: row.reporter_user_id,
      reported_user_id: row.reported_user_id,
      reporter_name: row.reporter_name,
      reported_name: row.reported_name,
      reported_already_banned: !!row.reported_banned_at,
      reason: row.reason,
      details: row.details,
      created_at: row.created_at.toISOString(),
    })),
  });
}
