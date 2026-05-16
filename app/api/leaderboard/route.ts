import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  UPLOADS_BUCKET,
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
import { safeImageUpload } from '@/lib/imageUpload';
import { parseJsonBody } from '@/lib/parseRequest';
import { LeaderboardPostBody } from '@/lib/schemas/account';
import { recordAudit } from '@/lib/audit';
import type { SupabaseClient } from '@supabase/supabase-js';

type PrivacyFlags = { hide_photo: boolean };

type ProfileMergeRow = {
  user_id: string;
  display_name: string;
  hide_photo_from_leaderboard: boolean;
  equipped_frame: string | null;
  equipped_flair: string | null;
  equipped_name_fx: string | null;
  current_streak: number | null;
  matches_won: number | null;
  subscription_status: string | null;
  banned_at: Date | null;
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

// uploadPhoto + decodeDataUrl removed in the anti-cheat rewrite —
// the new POST handler downloads the user's most recent private
// scan image from holymog-scans and copies it through sharp
// inline, so the from-data-URL path is dead.

async function deletePhoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  await supabase.storage
    .from(UPLOADS_BUCKET)
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
  //
  // Also pulls `display_name` so we can override the denormalized
  // `leaderboard.name` column at read time. The username PATCH does
  // sync that column inline but if it ever skips a row (silently
  // swallowed errors, race with a stale connection, etc.) the stale
  // name sticks. Live-JOIN override matches what the battle
  // leaderboard already does — rename reflects instantly.
  //
  // Also pulls `banned_at` so the filter below can drop any banned-
  // user entries that survived the ban-removes-leaderboard
  // transaction (direct-SQL bans, etc.).
  const userIds = rawEntries.map((r) => r.user_id).filter(Boolean);
  const flagsByUserId = new Map<string, PrivacyFlags>();
  const profileByUserId = new Map<string, ProfileMergeRow>();
  if (userIds.length > 0) {
    const pool = getPool();
    const profileResult = await pool.query<ProfileMergeRow>(
      `select user_id, display_name, hide_photo_from_leaderboard,
              equipped_frame, equipped_flair, equipped_name_fx,
              current_streak, matches_won, subscription_status,
              banned_at
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

  // Privacy + ban-aware merge:
  //   - banned users are excluded outright (ban paths already delete
  //     the row inside the ban transaction; this is the read-side
  //     backstop for direct-SQL bans + pre-existing entries).
  //   - hide_photo_from_leaderboard nulls the submitted leaderboard
  //     photo. Profile picture (avatar_url) is unaffected — that's
  //     identity, not the submission.
  //   - `name` is overridden from the live profile so renames reflect
  //     without depending on the denormalized column sync.
  const entries: LeaderboardRow[] = [];
  for (const row of rawEntries) {
    const flags = flagsByUserId.get(row.user_id);
    const p = profileByUserId.get(row.user_id);
    if (p?.banned_at) continue;
    const is_subscriber =
      p?.subscription_status === 'active' || p?.subscription_status === 'trialing';
    entries.push({
      ...row,
      name: p?.display_name ?? row.name,
      image_url: flags?.hide_photo ? null : row.image_url,
      equipped_frame: p?.equipped_frame ?? null,
      equipped_flair: p?.equipped_flair ?? null,
      equipped_name_fx: p?.equipped_name_fx ?? null,
      current_streak: p?.current_streak ?? null,
      matches_won: p?.matches_won ?? null,
      is_subscriber,
    });
  }

  return NextResponse.json({
    entries,
    hasMore: entries.length === MAX_RESULTS,
    page,
  });
}

/**
 * Anti-cheat leaderboard promote.
 *
 * The client no longer sends scores. The only path onto the board
 * is via `pending_leaderboard_submissions`, populated server-side
 * by `/api/score` after Gemini scoring completes. Forging a score
 * is now mathematically impossible — every leaderboard row is a
 * direct copy of a server-validated scan from the last hour.
 *
 * Body: `{ include_photo: boolean }`. If true, we look up the user's
 * most recent scan_history row, download the private archive image,
 * re-encode through sharp (strip EXIF), and upload to the public
 * faces bucket. Photo is opt-in at every tier (privacy-first).
 */
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

  const limiter = getRatelimit('leaderboardSubmit');
  if (limiter) {
    const result = await limiter.limit(user.id);
    if (!result.success) {
      return NextResponse.json(publicError('rate_limited'), { status: 429 });
    }
  }

  const parsed = await parseJsonBody(request, LeaderboardPostBody);
  if ('error' in parsed) return parsed.error;
  const { include_photo } = parsed.data;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(publicError('leaderboard_unconfigured'), { status: 503 });
  }

  const pool = getPool();

  // Look up the user's most recent pending submission. TTL 1 hour at
  // read time enforced via the WHERE clause; the prune cron sweeps
  // older rows physically.
  const pending = await pool.query<{ scores: Scores }>(
    `select scores
       from pending_leaderboard_submissions
      where user_id = $1
        and created_at > now() - interval '1 hour'
      limit 1`,
    [user.id],
  );
  if (pending.rows.length === 0) {
    return NextResponse.json(
      publicError(
        'no_pending_scan',
        undefined,
        'scan again — leaderboard submissions must come from a fresh scan within the last hour',
      ),
      { status: 404 },
    );
  }
  const scores = pending.rows[0].scores;

  // Defensive: even though /api/score's combineScores produces valid
  // shape, double-check before going to Supabase. The JSONB column
  // could theoretically contain anything if hand-edited.
  if (!validateScores(scores)) {
    return NextResponse.json(publicError('invalid_pending_scores'), { status: 500 });
  }

  // Name + avatar from profile (NOT request body — client can't set
  // these either).
  const profileInfo = await pool.query<{ display_name: string; image: string | null }>(
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

  const tier = getTier(scores.overall).letter;

  // Photo: if user opted in, copy the most-recent private scan image
  // → public faces bucket. The scan_history row stores image_path
  // pointing at holymog-scans.
  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  if (include_photo) {
    const scanRow = await pool.query<{ image_path: string | null }>(
      `select image_path
         from scan_history
        where user_id = $1 and image_path is not null
        order by created_at desc
        limit 1`,
      [user.id],
    );
    const srcPath = scanRow.rows[0]?.image_path ?? null;
    if (srcPath) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from('holymog-scans')
        .download(srcPath);
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
          // best-effort photo — leaderboard entry still goes through
          // with imageUrl=null if any step fails.
        }
      }
    }
  }

  // Look up existing leaderboard row.
  const { data: existing, error: lookupErr } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(publicError('lookup_failed', lookupErr.message), {
      status: 500,
    });
  }

  const row = {
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
  };

  if (existing) {
    const { data, error } = await supabase
      .from('leaderboard')
      .update(row)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) {
      if (imagePath) void deletePhoto(supabase, imagePath);
      return NextResponse.json(publicError('update_failed', error.message), { status: 500 });
    }
    void deletePhoto(supabase, existing.image_path);
    // Consume the pending row + audit.
    void pool.query(
      `delete from pending_leaderboard_submissions where user_id = $1`,
      [user.id],
    );
    void recordAudit({
      userId: user.id,
      action: 'leaderboard_submit',
      resource: data.id,
      metadata: { overall: scores.overall, isNew: false, include_photo },
    });
    return NextResponse.json({ entry: data, isNew: false });
  }

  const { data, error } = await supabase
    .from('leaderboard')
    .insert({ user_id: user.id, ...row })
    .select('*')
    .single();
  if (error) {
    if (imagePath) void deletePhoto(supabase, imagePath);
    return NextResponse.json(publicError('insert_failed', error.message), { status: 500 });
  }
  void pool.query(
    `delete from pending_leaderboard_submissions where user_id = $1`,
    [user.id],
  );
  void recordAudit({
    userId: user.id,
    action: 'leaderboard_submit',
    resource: data.id,
    metadata: { overall: scores.overall, isNew: true, include_photo },
  });
  return NextResponse.json({ entry: data, isNew: true });
}
