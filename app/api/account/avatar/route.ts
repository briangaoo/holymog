import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { FACES_BUCKET, getSupabaseAdmin } from '@/lib/supabase';
import { requireSameOrigin } from '@/lib/originGuard';
import { publicError } from '@/lib/errors';
import { parseJsonBody } from '@/lib/parseRequest';
import { AvatarPostBody } from '@/lib/schemas/account';
import { decodeDataUrl, safeImageUpload } from '@/lib/imageUpload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const origin = requireSameOrigin(request);
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status });

  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json(publicError('unauthenticated'), { status: 401 });
  }

  const parsed = await parseJsonBody(request, AvatarPostBody);
  if ('error' in parsed) return parsed.error;

  const decoded = decodeDataUrl(parsed.data.imageBase64);
  if (!decoded) {
    return NextResponse.json(publicError('invalid_image_format'), { status: 400 });
  }

  // sharp re-encode strips EXIF/GPS/camera metadata and normalises
  // the raster — protects against polyglot files and accidental
  // location leaks from phone selfies.
  let safe;
  try {
    safe = await safeImageUpload(decoded.buffer, 'avatar');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid_image';
    if (msg === 'image_too_large') {
      return NextResponse.json(publicError(msg), { status: 413 });
    }
    return NextResponse.json(publicError('invalid_image', err), { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(publicError('storage_unconfigured'), { status: 503 });
  }

  // Stable per-user path so each upload overwrites the previous avatar.
  // Cache-buster query param on the public URL forces immediate refresh
  // in browsers / Next/Image.
  const path = `avatars/${user.id}.${safe.ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(FACES_BUCKET)
    .upload(path, safe.buffer, {
      contentType: safe.mime,
      cacheControl: 'no-cache',
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(publicError('upload_failed', uploadErr.message), { status: 500 });
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

export async function DELETE(request: Request) {
  const origin = requireSameOrigin(request);
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status });

  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json(publicError('unauthenticated'), { status: 401 });
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
