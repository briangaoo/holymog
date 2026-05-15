import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { getRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Global audit feed — last N entries across every user. Used by the
 * admin console's "recent activity" panel to spot anomalies (mass
 * sign-ups, repeated failed actions, etc.) without having to look up a
 * specific user.
 *
 * GET only — no state change. Origin guard is unnecessary for reads,
 * but the admin gate is still enforced and the response 404s for
 * non-admins.
 */

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  resource: string | null;
  metadata: unknown;
  created_at: Date;
  ip_hash: string | null;
};

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const { success } = await limiter.limit(`admin:audit:${admin.userId}`);
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
  const r = await pool.query<AuditRow>(
    `select id, user_id, action, resource, metadata, created_at, ip_hash
       from audit_log
      order by created_at desc
      limit $1`,
    [limit],
  );

  return NextResponse.json({
    entries: r.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      resource: row.resource,
      metadata: row.metadata,
      created_at: row.created_at.toISOString(),
      ip_hash: row.ip_hash,
    })),
  });
}
