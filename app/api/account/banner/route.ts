import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { UPLOADS_BUCKET, getSupabaseAdmin } from '@/lib/supabase';
import { isSubscriber } from '@/lib/subscription';
import { requireSameOrigin } from '@/lib/originGuard';
import { publicError } from '@/lib/errors';
import { parseJsonBody } from '@/lib/parseRequest';
import { BannerPostBody } from '@/lib/schemas/account';
import { decodeDataUrl, safeImageUpload } from '@/lib/imageUpload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Subscriber-only animated-format cap. Static images flow through
// safeImageUpload (sharp) which has its own internal cap (8MB for
// banner kind). Animated banners bypass the sharp pipeline because
// sharp can't re-encode video — they retain their original bytes,
// which is why they keep a separate explicit cap.
const MAX_BYTES_SUB_ANIMATED = 8 * 1024 * 1024;
const ANIMATED_MIME_RE = /^data:(image\/gif|video\/mp4);base64,(.+)$/;

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
  const origin = requireSameOrigin(request);
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status });

  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json(publicError('unauthenticated'), { status: 401 });
  }

  const parsed = await parseJsonBody(request, BannerPostBody);
  if ('error' in parsed) return parsed.error;

  // Two paths:
  //   - static images (PNG / JPEG / WEBP) → sharp re-encode (strips
  //     EXIF/GPS/etc, normalises the raster).
  //   - animated formats (GIF / MP4) → no sharp pipeline (sharp can't
  //     do video). Direct upload with size cap + format whitelist.
  //     Subscriber-gated.
  const subscriber = await isSubscriber(user.id);
  const animatedMatch = parsed.data.imageBase64.match(ANIMATED_MIME_RE);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(publicError('storage_unconfigured'), { status: 503 });
  }

  let buffer: Buffer;
  let mime: string;
  let ext: string;

  if (animatedMatch) {
    if (!subscriber) {
      return NextResponse.json(
        publicError(
          'subscriber_only_format',
          undefined,
          'animated banners (GIF/MP4) require holymog+',
        ),
        { status: 403 },
      );
    }
    const claimedMime = animatedMatch[1];
    const animBuffer = Buffer.from(animatedMatch[2], 'base64');
    if (animBuffer.byteLength > MAX_BYTES_SUB_ANIMATED) {
      return NextResponse.json(publicError('image_too_large'), { status: 413 });
    }
    buffer = animBuffer;
    mime = claimedMime;
    ext = claimedMime === 'video/mp4' ? 'mp4' : 'gif';
  } else {
    // Static path — sharp does the decode + re-encode + EXIF strip.
    const decoded = decodeDataUrl(parsed.data.imageBase64);
    if (!decoded) {
      return NextResponse.json(publicError('invalid_image_format'), { status: 400 });
    }
    try {
      const safe = await safeImageUpload(decoded.buffer, 'banner');
      buffer = safe.buffer;
      mime = safe.mime;
      ext = safe.ext;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid_image';
      if (msg === 'image_too_large') {
        return NextResponse.json(publicError(msg), { status: 413 });
      }
      return NextResponse.json(publicError('invalid_image', err), { status: 400 });
    }
  }

  // Stable per-user path so each upload overwrites the previous banner.
  const path = `banners/${user.id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      cacheControl: 'no-cache',
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(publicError('upload_failed', uploadErr.message), { status: 500 });
  }

  const { data: pub } = supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(path);
  const cacheBustedUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const pool = getPool();
  await pool.query(`update profiles set banner_url = $1 where user_id = $2`, [
    cacheBustedUrl,
    user.id,
  ]);

  return NextResponse.json({ ok: true, banner_url: cacheBustedUrl });
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
    await supabase.storage
      .from(UPLOADS_BUCKET)
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
