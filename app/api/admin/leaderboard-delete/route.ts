import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { getRatelimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';
import { getSupabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Remove a user's leaderboard entry. Yanks the row from the
 * `leaderboard` table AND the associated photo from the storage
 * bucket so the public surface is clean. Does NOT touch profiles or
 * scan_history — the user keeps their stats, just loses their place
 * on the public board.
 *
 * Idempotent: deleting an entry that doesn't exist is a no-op and
 * returns ok=true.
 */

type Body = {
  userId?: unknown;
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
    const { success } = await limiter.limit(
      `admin:leaderboard-delete:${admin.userId}`,
    );
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
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  // Grab the row first so we know which storage object to drop.
  const { data: existing, error: selErr } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', userId)
    .limit(1);
  if (selErr) {
    return NextResponse.json(
      { error: 'lookup_failed', message: selErr.message },
      { status: 500 },
    );
  }
  const row = existing?.[0] as
    | { id: string; image_path: string | null }
    | undefined;
  if (!row) {
    // Already gone — nothing to delete. Audit the operator's intent
    // anyway so the action shows up in the log.
    void recordAudit({
      userId,
      action: 'leaderboard_remove',
      resource: userId,
      metadata: { by: 'admin_console', operator: admin.userId, was_present: false },
    });
    return NextResponse.json({ ok: true, deleted: false });
  }

  const { error: delErr } = await supabase
    .from('leaderboard')
    .delete()
    .eq('user_id', userId);
  if (delErr) {
    return NextResponse.json(
      { error: 'delete_failed', message: delErr.message },
      { status: 500 },
    );
  }

  if (row.image_path) {
    // Best-effort photo cleanup. We don't roll the DB delete back on
    // storage failure — the row matters more than the orphan blob,
    // which the prune-old-data cron sweeps later anyway.
    const { error: storageErr } = await supabase.storage
      .from(UPLOADS_BUCKET)
      .remove([row.image_path]);
    if (storageErr) {
      void recordAudit({
        userId,
        action: 'leaderboard_remove',
        resource: row.id,
        metadata: {
          by: 'admin_console',
          operator: admin.userId,
          orphan_blob: row.image_path,
          storage_error: storageErr.message,
        },
      });
      return NextResponse.json({ ok: true, deleted: true, orphan_blob: true });
    }
  }

  void recordAudit({
    userId,
    action: 'leaderboard_remove',
    resource: row.id,
    metadata: { by: 'admin_console', operator: admin.userId },
  });

  return NextResponse.json({ ok: true, deleted: true });
}
