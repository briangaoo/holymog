import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { UPLOADS_BUCKET, getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/account/leaderboard
 *
 * Removes the signed-in user's leaderboard entry, including any
 * associated photo in Supabase Storage. Idempotent — succeeds even if
 * there's no entry to delete.
 */
export async function DELETE() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  // Look up the row to grab its image_path before deleting.
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: true, deleted: false });
  }

  // Delete the row first; if storage cleanup fails, we don't mind an
  // orphan file (cheaper than a half-deleted state).
  const { error: deleteErr } = await supabase
    .from('leaderboard')
    .delete()
    .eq('user_id', user.id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  if (existing.image_path) {
    await supabase.storage
      .from(UPLOADS_BUCKET)
      .remove([existing.image_path])
      .catch(() => {
        // best-effort
      });
  }

  return NextResponse.json({ ok: true, deleted: true });
}
