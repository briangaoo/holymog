import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  FACES_BUCKET,
  getSupabase,
  type LeaderboardRow,
} from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { getRatelimit } from '@/lib/ratelimit';
import { getTier } from '@/lib/tier';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 24;
const MAX_RESULTS = 100;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type PostBody = {
  name?: unknown;
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
  const match = imageBase64.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/);
  if (!match) return { error: 'invalid_image', status: 400 };
  const mime = match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return { error: 'image_too_large', status: 413 };
  }
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const path = `${randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(FACES_BUCKET)
    .upload(path, buf, { contentType: mime, cacheControl: '3600' });
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
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
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
  const entries = data ?? [];
  return NextResponse.json({
    entries,
    hasMore: entries.length === MAX_RESULTS,
    page,
  });
}

export async function POST(request: Request) {
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

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'leaderboard_unconfigured' }, { status: 503 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (rawName.length === 0 || rawName.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const name = rawName.replace(/\s+/g, ' ').toLowerCase();

  const scores = validateScores(body.scores);
  if (!scores) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 });
  }

  const tier = getTier(scores.overall).letter;
  const wantsPhoto =
    typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;

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
    })
    .select('*')
    .single();
  if (error) {
    if (imagePath) void deletePhoto(supabase, imagePath);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data, isNew: true });
}
