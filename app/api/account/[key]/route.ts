import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getRatelimit } from '@/lib/ratelimit';
import { isValidAccountKey, normaliseAccountKey } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: rawKey } = await params;
  const key = normaliseAccountKey(rawKey ?? '');
  if (!isValidAccountKey(key)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 400 });
  }

  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const result = await limiter.limit(`acct:${ip}`);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'leaderboard_unconfigured' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('leaderboard')
    .select('name, overall, tier, jawline, eyes, skin, cheekbones, image_url')
    .eq('account_key', key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    name: data.name,
    overall: data.overall,
    tier: data.tier,
    sub: {
      jawline: data.jawline,
      eyes: data.eyes,
      skin: data.skin,
      cheekbones: data.cheekbones,
    },
    hasPhoto: !!data.image_url,
    imageUrl: data.image_url,
  });
}
