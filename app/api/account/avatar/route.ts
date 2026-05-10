import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { FACES_BUCKET, getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

type Body = { imageBase64?: unknown };

/**
 * POST /api/account/avatar
 *
 * Accepts a base64-encoded PNG of a square cropped avatar (the
 * AvatarUploader component produces 256×256 PNGs at this size cap),
 * uploads to Supabase Storage at `avatars/{userId}.png` (overwriting
 * any prior avatar), and writes the public URL to the user's `image`
 * column so it shows up everywhere we read user.image.
 *
 * DELETE same path clears the avatar (resets to OAuth provider's
 * default image where available, or the initial-letter fallback).
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.imageBase64 !== 'string') {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }

  const match = body.imageBase64.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'invalid_image_format' }, { status: 400 });
  }
  const mime = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  // Stable per-user path so each upload overwrites the previous avatar.
  // We append a cache-buster query param to the public URL (below) so
  // browsers / Next/Image fetch the new bytes immediately.
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const path = `avatars/${user.id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(FACES_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      cacheControl: 'no-cache',
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(FACES_BUCKET).getPublicUrl(path);
  const cacheBustedUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const pool = getPool();
  await pool.query(`update users set image = $1 where id = $2`, [
    cacheBustedUrl,
    user.id,
  ]);

  // Keep the leaderboard avatar in sync — best-effort (no entry is fine).
  await pool.query(
    `update leaderboard set avatar_url = $1 where user_id = $2`,
    [cacheBustedUrl, user.id],
  ).catch(() => {});

  return NextResponse.json({ ok: true, image: cacheBustedUrl });
}

export async function DELETE() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    // Best-effort delete of any existing avatar files. We don't know the
    // exact extension stored last, so attempt both common forms.
    await supabase.storage
      .from(FACES_BUCKET)
      .remove([`avatars/${user.id}.png`, `avatars/${user.id}.jpg`])
      .catch(() => {
        // best-effort
      });
  }

  const pool = getPool();
  await pool.query(`update users set image = NULL where id = $1`, [user.id]);

  return NextResponse.json({ ok: true });
}
