import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Delete a single `scan_history` row by id. Also recomputes the user's
 * `best_scan_overall` since deleting their previous top scan should
 * drop the headline number on their profile to whatever's left.
 *
 * Doesn't touch `leaderboard` — that's a separate publish action with
 * its own row. If the operator wants to remove the user from the
 * board, use /api/admin/leaderboard-delete after this.
 */

type Body = {
  scanId?: unknown;
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
    const { success } = await limiter.limit(`admin:scan-delete:${admin.userId}`);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const scanId = typeof body.scanId === 'string' ? body.scanId.trim() : '';
  if (!UUID_RE.test(scanId)) {
    return NextResponse.json({ error: 'invalid_scan_id' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let ownerUserId: string | null = null;
  let deletedOverall: number | null = null;
  try {
    await client.query('begin');

    const del = await client.query<{ user_id: string; overall: number }>(
      `delete from scan_history
        where id = $1
        returning user_id, overall`,
      [scanId],
    );
    if (del.rowCount === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'scan_not_found' }, { status: 404 });
    }
    ownerUserId = del.rows[0].user_id;
    deletedOverall = del.rows[0].overall;

    // Recompute best_scan_overall in case we just removed the user's
    // headline scan. coalesce keeps the value 0-safe when the user has
    // no scans left.
    await client.query(
      `update profiles
          set best_scan_overall = (
            select coalesce(max(overall), 0) from scan_history where user_id = $1
          )
        where user_id = $1`,
      [ownerUserId],
    );

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: 'delete_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  void recordAudit({
    userId: ownerUserId,
    action: 'scan_deleted',
    resource: scanId,
    metadata: {
      by: 'admin_console',
      operator: admin.userId,
      deleted_overall: deletedOverall,
    },
  });

  return NextResponse.json({ ok: true });
}
