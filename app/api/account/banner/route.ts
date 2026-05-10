import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { FACES_BUCKET, getSupabaseAdmin } from '@/lib/supabase';
import { isSubscriber } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES_FREE = 4 * 1024 * 1024; // 4 MB
const MAX_BYTES_SUB = 8 * 1024 * 1024; // 8 MB for subscribers (animated formats are larger)
const FREE_MIME_RE = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/;
const SUB_MIME_RE = /^data:(image\/(png|jpeg|jpg|webp|gif)|video\/mp4);base64,(.+)$/;

type Body = { imageBase64?: unknown };

/**
 * POST /api/account/banner
 *
 * Accepts a base64-encoded JPG/PNG profile banner. Banners typically
 * render at a 3:1 aspect ratio (~1500×500). We don't crop server-side
 * — the client provides whatever the user picks, and the public
 * profile page renders it with `object-cover` so any aspect lands in
 * the banner box. Stable per-user path so re-uploads overwrite.
 *
 * DELETE same path clears the banner (resets to the tier-coloured
 * gradient fallback rendered on the public profile).
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

  // Subscribers can upload animated banners (gif / mp4) up to 8 MB.
  // Free users are restricted to static images (png / jpg / webp) up to 4 MB.
  const subscriber = await isSubscriber(user.id);
  const re = subscriber ? SUB_MIME_RE : FREE_MIME_RE;
  const match = body.imageBase64.match(re);
  if (!match) {
    return NextResponse.json(
      {
        error: 'invalid_image_format',
        message: subscriber
          ? 'use PNG, JPG, WEBP, GIF, or MP4'
          : 'use PNG, JPG, or WEBP (upgrade to holymog+ for animated banners)',
      },
      { status: 400 },
    );
  }
  // SUB_MIME_RE captures the whole mime in group 1; FREE_MIME_RE captures just the format.
  const rawMime = subscriber ? match[1] : match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`;
  const payloadIdx = subscriber ? 3 : 2;
  const mime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const buffer = Buffer.from(match[payloadIdx], 'base64');
  const cap = subscriber ? MAX_BYTES_SUB : MAX_BYTES_FREE;
  if (buffer.byteLength > cap) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'storage_unconfigured' }, { status: 503 });
  }

  // Stable per-user path so each upload overwrites the previous banner.
  const ext =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/gif'
          ? 'gif'
          : mime === 'video/mp4'
            ? 'mp4'
            : 'jpg';
  const path = `banners/${user.id}.${ext}`;

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
  await pool.query(`update profiles set banner_url = $1 where user_id = $2`, [
    cacheBustedUrl,
    user.id,
  ]);

  return NextResponse.json({ ok: true, banner_url: cacheBustedUrl });
}

export async function DELETE() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.storage
      .from(FACES_BUCKET)
      .remove([
        `banners/${user.id}.png`,
        `banners/${user.id}.jpg`,
        `banners/${user.id}.webp`,
        `banners/${user.id}.gif`,
        `banners/${user.id}.mp4`,
      ])
      .catch(() => {
        // best-effort
      });
  }

  const pool = getPool();
  await pool.query(`update profiles set banner_url = null where user_id = $1`, [
    user.id,
  ]);

  return NextResponse.json({ ok: true });
}
