import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { FACES_BUCKET, getSupabase, type LeaderboardRow } from '@/lib/supabase';
import { getRatelimit } from '@/lib/ratelimit';
import { getTier } from '@/lib/tier';

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

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ entries: [] satisfies LeaderboardRow[], error: 'unconfigured' });
  }
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('overall', { ascending: false })
    .limit(MAX_RESULTS);
  if (error) {
    return NextResponse.json({ entries: [], error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request) {
  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
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
  const name = rawName.replace(/\s+/g, ' ');

  const scores = validateScores(body.scores);
  if (!scores) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 });
  }

  // Optional photo upload
  let imageUrl: string | null = null;
  if (typeof body.imageBase64 === 'string' && body.imageBase64.length > 0) {
    const match = body.imageBase64.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
    }
    const mime = match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const path = `${randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(FACES_BUCKET)
      .upload(path, buf, { contentType: mime, cacheControl: '3600' });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }
    const { data: pub } = supabase.storage.from(FACES_BUCKET).getPublicUrl(path);
    imageUrl = pub.publicUrl;
  }

  const tier = getTier(scores.overall).letter;
  const { data, error } = await supabase
    .from('leaderboard')
    .insert({
      name,
      overall: scores.overall,
      tier,
      jawline: scores.sub.jawline,
      eyes: scores.sub.eyes,
      skin: scores.sub.skin,
      cheekbones: scores.sub.cheekbones,
      image_url: imageUrl,
    })
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}
