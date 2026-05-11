import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  FACES_BUCKET,
  getSupabase,
  getSupabaseAdmin,
  type LeaderboardRow,
} from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getRatelimit } from '@/lib/ratelimit';
import { getTier } from '@/lib/tier';
import { requireSameOrigin } from '@/lib/originGuard';
import { isLeaderboardKilled } from '@/lib/featureFlags';
import { publicError } from '@/lib/errors';
import { decodeDataUrl, safeImageUpload } from '@/lib/imageUpload';
import type { SupabaseClient } from '@supabase/supabase-js';

type PrivacyFlags = { hide_photo: boolean };

type ProfileMergeRow = {
  user_id: string;
  hide_photo_from_leaderboard: boolean;
  equipped_frame: string | null;
  equipped_flair: string | null;
  equipped_name_fx: string | null;
  current_streak: number | null;
  matches_won: number | null;
  subscription_status: string | null;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESULTS = 100;
const MAX_PAGE = 1000; // 100 results × 1000 pages = 100k rows; far past any real use
// Image-byte cap is now enforced inside safeImageUpload (lib/imageUpload.ts).
// Leaderboard kind caps at 4 MB after base64 decode.

type PostBody = {
  scores?: unknown;
  imageBase64?: unknown;
};

type Scores = {
  overall: number;
  sub: { jawline: number; eyes: number; skin: number; cheekbones: number };
};

type UploadedPhoto = { path: string; url: string };

function isInt0to100(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

function validateScores(s: unknown): Scores | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const sub = o.sub as Record<string, unknown> | undefined;
  if (
    !isInt0to100(o.overall) ||
    !sub ||
    !isInt0to100(sub.jawline) ||
    !isInt0to100(sub.eyes) ||
    !isInt0to100(sub.skin) ||
    !isInt0to100(sub.cheekbones)
  ) {
    return null;
  }
  return {
    overall: Math.round(o.overall),
    sub: {
      jawline: Math.round(sub.jawline as number),
      eyes: Math.round(sub.eyes as number),
      skin: Math.round(sub.skin as number),
      cheekbones: Math.round(sub.cheekbones as number),
    },
  };
}

async function uploadPhoto(
  supabase: SupabaseClient,
  imageBase64: string,
): Promise<UploadedPhoto | { error: string; status: number }> {
  const decoded = decodeDataUrl(imageBase64);
  if (!decoded) return { error: 'invalid_image', status: 400 };
  // Re-encode through sharp: strips EXIF (incl. GPS — phone selfies
  // embed location), caps dimensions, normalises any polyglot payload
  // into a clean JPEG.
  let safe;
  try {
    safe = await safeImageUpload(decoded.buffer, 'leaderboard');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid_image';
    if (msg === 'image_too_large') return { error: msg, status: 413 };
    return { error: 'invalid_image', status: 400 };
  }
  const path = `${randomUUID()}.${safe.ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(FACES_BUCKET)
    .upload(path, safe.buffer, {
      contentType: safe.mime,
      cacheControl: '3600',
    });
  if (uploadErr) return { error: uploadErr.message, status: 500 };
  const { data: pub } = supabase.storage.from(FACES_BUCKET).getPublicUrl(path);
  return { path, url: pub.publicUrl };
}

async function deletePhoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  await supabase.storage
    .from(FACES_BUCKET)
    .remove([path])
    .catch(() => {
      // best-effort; orphan acceptable
    });
}

export async function GET(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      entries: [] as LeaderboardRow[],
      hasMore: false,
      error: 'unconfigured',
    });
  }
  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Math.min(
    MAX_PAGE,
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
  );
  const from = (page - 1) * MAX_RESULTS;
  const to = from + MAX_RESULTS - 1;

  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('overall', { ascending: false })
    .range(from, to);
  if (error) {
    return NextResponse.json(
      { entries: [], hasMore: false, error: error.message },
      { status: 500 },
    );
  }
  const rawEntries = (data ?? []) as LeaderboardRow[];

  // Merge profile data (privacy flag + equipped cosmetics + subscriber +
  // userStats fields for smart cosmetic rendering). Single JOIN query
  // by user_id for the page's rows.
  const userIds = rawEntries.map((r) => r.user_id).filter(Boolean);
  const flagsByUserId = new Map<string, PrivacyFlags>();
  const profileByUserId = new Map<string, ProfileMergeRow>();
  if (userIds.length > 0) {
    const pool = getPool();
    const profileResult = await pool.query<ProfileMergeRow>(
      `select user_id, hide_photo_from_leaderboard,
              equipped_frame, equipped_flair, equipped_name_fx,
              current_streak, matches_won, subscription_status
         from profiles
        where user_id = any($1::uuid[])`,
      [userIds],
    );
    for (const row of profileResult.rows) {
      flagsByUserId.set(row.user_id, {
        hide_photo: row.hide_photo_from_leaderboard,
      });
      profileByUserId.set(row.user_id, row);
    }
  }

  // Privacy: when the user has flipped `hide_photo_from_leaderboard`,
  // null out their submitted leaderboard photo. Profile picture
  // (avatar_url) is unaffected — that's identity, not the submission.
  const entries: LeaderboardRow[] = rawEntries.map((row) => {
    const flags = flagsByUserId.get(row.user_id);
    const p = profileByUserId.get(row.user_id);
    const is_subscriber =
      p?.subscription_status === 'active' || p?.subscription_status === 'trialing';
    return {
      ...row,
      image_url: flags?.hide_photo ? null : row.image_url,
      equipped_frame: p?.equipped_frame ?? null,
      equipped_flair: p?.equipped_flair ?? null,
      equipped_name_fx: p?.equipped_name_fx ?? null,
      current_streak: p?.current_streak ?? null,
      matches_won: p?.matches_won ?? null,
      is_subscriber,
    };
  });

  return NextResponse.json({
    entries,
    hasMore: entries.length === MAX_RESULTS,
    page,
  });
}

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
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? user.id;
    const result = await limiter.limit(`lb:${ip}`);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'leaderboard_unconfigured' }, { status: 503 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Name and avatar come from the user's profile, not from the request body.
  const pool = getPool();
  const profileInfo = await pool.query<{ display_name: string; image: string | null }>(
    `select p.display_name, u.image
       from profiles p
       join users u on u.id = p.user_id
      where p.user_id = $1
      limit 1`,
    [user.id],
  );
  if (!profileInfo.rows[0]) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 422 });
  }
  const name = profileInfo.rows[0].display_name;
  const avatarUrl = profileInfo.rows[0].image ?? null;

  const scores = validateScores(body.scores);
  if (!scores) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 });
  }

  const tier = getTier(scores.overall).letter;
  const wantsPhoto =
    typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;

  // Photo is fully optional at every tier. The S-tier anti-cheat path
  // is handled separately: /api/score archives every scan image to the
  // private holymog-scans bucket and flags scan_history.requires_review
  // when overall ≥ PHOTO_REQUIRED_THRESHOLD, then emails admin for
  // human review. Whether the user chooses to display their face on
  // the public board here is unrelated — privacy first.

  // One row per user — look up existing.
  const { data: existing, error: lookupErr } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  if (wantsPhoto) {
    const upload = await uploadPhoto(supabase, body.imageBase64 as string);
    if ('error' in upload) {
      return NextResponse.json({ error: upload.error }, { status: upload.status });
    }
    imageUrl = upload.url;
    imagePath = upload.path;
  }

  if (existing) {
    const { data, error } = await supabase
      .from('leaderboard')
      .update({
        name,
        overall: scores.overall,
        tier,
        jawline: scores.sub.jawline,
        eyes: scores.sub.eyes,
        skin: scores.sub.skin,
        cheekbones: scores.sub.cheekbones,
        image_url: imageUrl,
        image_path: imagePath,
        avatar_url: avatarUrl,
      })
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) {
      if (imagePath) void deletePhoto(supabase, imagePath);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    void deletePhoto(supabase, existing.image_path);
    return NextResponse.json({ entry: data, isNew: false });
  }

  const { data, error } = await supabase
    .from('leaderboard')
    .insert({
      user_id: user.id,
      name,
      overall: scores.overall,
      tier,
      jawline: scores.sub.jawline,
      eyes: scores.sub.eyes,
      skin: scores.sub.skin,
      cheekbones: scores.sub.cheekbones,
      image_url: imageUrl,
      image_path: imagePath,
      avatar_url: avatarUrl,
    })
    .select('*')
    .single();
  if (error) {
    if (imagePath) void deletePhoto(supabase, imagePath);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data, isNew: true });
}
