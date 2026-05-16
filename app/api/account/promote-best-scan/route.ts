import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getSupabaseAdmin, UPLOADS_BUCKET } from '@/lib/supabase';
import { getRatelimit } from '@/lib/ratelimit';
import { requireSameOrigin } from '@/lib/originGuard';
import { isLeaderboardKilled } from '@/lib/featureFlags';
import { publicError } from '@/lib/errors';
import { safeImageUpload } from '@/lib/imageUpload';
import { getTier } from '@/lib/tier';
import { recordAudit } from '@/lib/audit';
import { parseJsonBody } from '@/lib/parseRequest';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-click promote of the user's all-time best scan to the leaderboard.
 *
 * Unlike POST /api/leaderboard which requires a fresh
 * `pending_leaderboard_submissions` row (1-hour TTL after the user just
 * scanned), this endpoint sources from `scan_history` directly so a
 * user whose best scan happened days ago can still promote it without
 * re-scanning. Triggered by the settings notice when the user's
 * best_scan_overall exceeds the score on their current leaderboard
 * entry.
 *
 * Anti-cheat is still anchored on server-validated scan_history — every
 * row in that table was written by /api/score after Gemini scoring
 * resolved, with the same trust posture as pending_leaderboard_submissions.
 *
 * Body: `{ include_photo: boolean }`. When true we copy the matching
 * scan_history.image_path image from the private holymog-scans bucket
 * → public holymog-uploads via sharp re-encode (strip EXIF, normalize).
 */

const BodySchema = z
  .object({
    include_photo: z.boolean(),
  })
  .strict();

export async function POST(request: Request) {
  if (isLeaderboardKilled()) {
    return NextResponse.json(publicError('system_unavailable'), { status: 503 });
  }

  const origin = requireSameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(origin.body, { status: origin.status });
  }

  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json(publicError('unauthenticated'), { status: 401 });
  }

  // Same preset as the regular promote — caps abuse at the same per-hour
  // budget (a user can submit OR promote-best, both count).
  const limiter = getRatelimit('leaderboardSubmit');
  if (limiter) {
    const result = await limiter.limit(user.id);
    if (!result.success) {
      return NextResponse.json(publicError('rate_limited'), { status: 429 });
    }
  }

  const parsed = await parseJsonBody(request, BodySchema);
  if ('error' in parsed) return parsed.error;
  const { include_photo } = parsed.data;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(publicError('leaderboard_unconfigured'), {
      status: 503,
    });
  }

  const pool = getPool();

  // Look up the user's all-time best scan from scan_history. Tied
  // scores break by created_at desc (most recent wins) so the photo
  // is as fresh as possible. Image_path required — a scan with no
  // archived image can't seed a leaderboard photo so we can't honour
  // include_photo for those.
  const bestRow = await pool.query<{
    id: string;
    overall: number;
    jawline: number;
    eyes: number;
    skin: number;
    cheekbones: number;
    image_path: string | null;
  }>(
    `select id, overall, jawline, eyes, skin, cheekbones, image_path
       from scan_history
      where user_id = $1
      order by overall desc, created_at desc
      limit 1`,
    [user.id],
  );

  if (bestRow.rows.length === 0) {
    return NextResponse.json(
      publicError(
        'no_scan_history',
        undefined,
        'no scans on record yet — scan first',
      ),
      { status: 404 },
    );
  }
  const best = bestRow.rows[0];

  const profileInfo = await pool.query<{
    display_name: string;
    image: string | null;
  }>(
    `select p.display_name, u.image
       from profiles p
       join users u on u.id = p.user_id
      where p.user_id = $1
      limit 1`,
    [user.id],
  );
  if (!profileInfo.rows[0]) {
    return NextResponse.json(publicError('profile_not_found'), { status: 422 });
  }
  const name = profileInfo.rows[0].display_name;
  const avatarUrl = profileInfo.rows[0].image ?? null;

  const tier = getTier(best.overall).letter;

  // Photo: copy scan_history.image_path → public bucket if opted in
  // AND the row has an image. Best-effort; failure means the
  // leaderboard row still goes through with imageUrl = null.
  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  if (include_photo && best.image_path) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('holymog-scans')
      .download(best.image_path);
    if (!dlErr && blob) {
      try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const safe = await safeImageUpload(buffer, 'leaderboard');
        const dstPath = `${randomUUID()}.${safe.ext}`;
        const { error: upErr } = await supabase.storage
          .from(UPLOADS_BUCKET)
          .upload(dstPath, safe.buffer, {
            contentType: safe.mime,
            cacheControl: '3600',
          });
        if (!upErr) {
          const { data: pub } = supabase.storage
            .from(UPLOADS_BUCKET)
            .getPublicUrl(dstPath);
          imageUrl = pub.publicUrl;
          imagePath = dstPath;
        }
      } catch {
        // best-effort; leaderboard row still updates with imageUrl=null
      }
    }
  }

  // Look up existing leaderboard row. If it exists we UPDATE; if not we
  // INSERT. The previous photo (if any) gets best-effort-removed
  // after a successful UPDATE so we don't orphan storage objects.
  const { data: existing, error: lookupErr } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      publicError('lookup_failed', lookupErr.message),
      { status: 500 },
    );
  }

  const row = {
    name,
    overall: best.overall,
    tier,
    jawline: best.jawline,
    eyes: best.eyes,
    skin: best.skin,
    cheekbones: best.cheekbones,
    image_url: imageUrl,
    image_path: imagePath,
    avatar_url: avatarUrl,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('leaderboard')
      .update(row)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) {
      if (imagePath) {
        void supabase.storage
          .from(UPLOADS_BUCKET)
          .remove([imagePath])
          .catch(() => {});
      }
      return NextResponse.json(publicError('update_failed', error.message), {
        status: 500,
      });
    }
    if (existing.image_path && existing.image_path !== imagePath) {
      void supabase.storage
        .from(UPLOADS_BUCKET)
        .remove([existing.image_path])
        .catch(() => {});
    }
    void recordAudit({
      userId: user.id,
      action: 'leaderboard_submit',
      resource: data.id,
      metadata: {
        overall: best.overall,
        isNew: false,
        include_photo,
        source: 'promote_best',
      },
    });
    return NextResponse.json({ entry: data, isNew: false });
  }

  const { data, error } = await supabase
    .from('leaderboard')
    .insert({ user_id: user.id, ...row })
    .select('*')
    .single();
  if (error) {
    if (imagePath) {
      void supabase.storage
        .from(UPLOADS_BUCKET)
        .remove([imagePath])
        .catch(() => {});
    }
    return NextResponse.json(publicError('insert_failed', error.message), {
      status: 500,
    });
  }
  void recordAudit({
    userId: user.id,
    action: 'leaderboard_submit',
    resource: data.id,
    metadata: {
      overall: best.overall,
      isNew: true,
      include_photo,
      source: 'promote_best',
    },
  });
  return NextResponse.json({ entry: data, isNew: true });
}
