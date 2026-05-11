import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { analyzeFaces } from '@/lib/vision';
import { getRatelimit } from '@/lib/ratelimit';
import { combineScores } from '@/lib/scoreEngine';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getOrIssueAnonymousId } from '@/lib/anonymousId';
import {
  checkScanLimit,
  readClientIp,
  recordScanAttempt,
} from '@/lib/scanLimit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail, appUrl } from '@/lib/email';
import { PHOTO_REQUIRED_THRESHOLD } from '@/lib/tier';
import {
  checkAchievements,
  type AchievementGrant,
} from '@/lib/achievements';
import { requireSameOrigin } from '@/lib/originGuard';
import { isScoreKilled } from '@/lib/featureFlags';
import { publicError } from '@/lib/errors';
import { checkBudget } from '@/lib/costCap';
import type { VisionScore } from '@/types';

const SCANS_BUCKET = 'holymog-scans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_DIM = 256;
const MAX_DIM = 2048;
const MAX_IMAGES = 6;

type Body = { imageBase64?: unknown; images?: unknown };

function decodeBase64(input: string): Buffer | null {
  const cleaned = input.startsWith('data:')
    ? input.slice(input.indexOf(',') + 1)
    : input;
  try {
    return Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
}

function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}

function readJpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    i += 2;
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = buf.readUInt16BE(i);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      const h = buf.readUInt16BE(i + 3);
      const w = buf.readUInt16BE(i + 5);
      return { w, h };
    }
    i += len;
  }
  return null;
}

function detectMime(buf: Buffer): string {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  return 'application/octet-stream';
}

function validateAndBlob(
  imageBase64: string,
): { blob: Blob } | { error: string; status: number } {
  const buffer = decodeBase64(imageBase64);
  if (!buffer) return { error: 'decode_failed', status: 400 };
  if (buffer.byteLength > MAX_BYTES) return { error: 'image_too_large', status: 413 };
  const dims = readPngDimensions(buffer) ?? readJpegDimensions(buffer);
  if (!dims) return { error: 'unsupported_image', status: 415 };
  if (dims.w < MIN_DIM || dims.h < MIN_DIM || dims.w > MAX_DIM || dims.h > MAX_DIM) {
    return { error: 'bad_dimensions', status: 400 };
  }
  const mime = detectMime(buffer);
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return { blob: new Blob([ab as ArrayBuffer], { type: mime }) };
}

export async function POST(request: Request) {
  // Kill switch first — short-circuits before any auth or DB work.
  if (isScoreKilled()) {
    return NextResponse.json(publicError('system_unavailable'), { status: 503 });
  }
  // Daily Gemini budget cap — the hard ceiling on cost abuse. When
  // today's spend has crossed DAILY_GEMINI_BUDGET_USD, all scoring
  // halts until 00:00 UTC. Failure mode is intentional 503 (not 429)
  // so retries don't make it worse.
  const budget = await checkBudget();
  if (!budget.ok) {
    return NextResponse.json(publicError('system_unavailable'), { status: 503 });
  }
  // Origin guard: blocks other sites from using us as a free
  // Gemini-face-scoring proxy. Daily Gemini budget cap is the hard
  // ceiling; this is the cheap first line.
  const origin = requireSameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(origin.body, { status: origin.status });
  }

  // Auth + scan-limit gate run BEFORE the IP rate limit, so an attacker can't
  // burn through Gemini budget by hammering the endpoint past their limit.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const anonId = userId ? null : await getOrIssueAnonymousId();
  const ip = readClientIp(request);

  const limit = await checkScanLimit({ userId, anonId, ip });
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'scan_limit_exceeded',
        reason: limit.reason,
        used: limit.used,
        limit: limit.limit,
        signedIn: limit.signedIn,
        resetInSeconds: limit.resetInSeconds,
      },
      { status: 429 },
    );
  }

  const limiter = getRatelimit();
  if (limiter) {
    const result = await limiter.limit(ip);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Accept either { images: [...] } (multi-frame) or { imageBase64 } (single-image fallback).
  const rawImages: string[] = (() => {
    if (Array.isArray(body.images)) {
      return body.images.filter((x): x is string => typeof x === 'string');
    }
    if (typeof body.imageBase64 === 'string') return [body.imageBase64];
    return [];
  })();

  if (rawImages.length === 0) {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }
  if (rawImages.length > MAX_IMAGES) {
    return NextResponse.json({ error: 'too_many_images' }, { status: 400 });
  }

  const blobs: Blob[] = [];
  for (const img of rawImages) {
    const result = validateAndBlob(img);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    blobs.push(result.blob);
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 });
  }

  let vision: VisionScore;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await analyzeFaces(blobs);
    vision = result.vision;
    inputTokens = result.tokens.input;
    outputTokens = result.tokens.output;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision_error';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Server-side scoring. Anon never receives the raw vision payload — the
  // 30-field breakdown is the value prop behind the sign-in gate.
  const scores = combineScores(vision);

  // Best-effort: persist to profile + record the attempt. Fire-and-forget so
  // the response isn't blocked by DB latency.
  void recordScanAttempt({ userId, anonId, ip });
  if (userId) {
    void persistBestScanIfBeaten(userId, vision);
    // Archive the scan image + score to the private bucket. Uses the
    // most recent (best stabilised) frame from the request. Anti-cheat
    // review queue: scores ≥ PHOTO_REQUIRED_THRESHOLD are flagged and
    // admin gets an email.
    const lastImage = rawImages[rawImages.length - 1];
    void persistScanHistory(userId, scores, vision, lastImage);
  }

  // Achievement firing: only for signed-in users.
  //
  // persistScanHistory above is fire-and-forget so its row may not be
  // committed before this count query runs. We add +1 to represent the
  // scan that just completed — the user already saw their score, so
  // the achievement should fire regardless of whether persistScanHistory
  // wins or loses the race. tryGrant is idempotent on
  // (user_id, achievement_key) so duplicate calls are no-ops.
  let grants: AchievementGrant[] = [];
  if (userId) {
    try {
      const pool = getPool();
      const counts = await pool.query<{ total: number; best: number | null }>(
        `select count(*)::int as total, max(overall)::int as best
           from scan_history where user_id = $1`,
        [userId],
      );
      const total = (counts.rows[0]?.total ?? 0) + 1;
      const best = Math.max(counts.rows[0]?.best ?? 0, scores.overall);
      grants = await checkAchievements(userId, {
        totalScans: total,
        bestScanOverall: best,
      });
    } catch {
      // Best-effort — achievements aren't load-bearing on the response.
    }
  }

  // Strip vision for anon. The `scores` object also has `vision` attached by
  // combineScores — clear that field too so DevTools/network can't read it.
  const responseScores = userId ? scores : { ...scores, vision: undefined };

  return NextResponse.json(
    {
      scores: responseScores,
      vision: userId ? vision : null,
      achievements: grants,
    },
    {
      headers: {
        'X-Tokens-Input': String(inputTokens),
        'X-Tokens-Output': String(outputTokens),
      },
    },
  );
}

/**
 * Append the scan to scan_history AND archive the user's face image
 * to the private holymog-scans bucket. Image lives at:
 *
 *   {user_id}/{scan_id}.{ext}
 *
 * The bucket is private (public=false) — no anon access. Images are
 * served back to the user via /api/account/scans/[id]/image which
 * mints a short-lived signed URL after auth + ownership check.
 *
 * If the score reaches PHOTO_REQUIRED_THRESHOLD (S- and above), the
 * row is flagged with `requires_review = true` and admin is emailed
 * the signed-URL preview. Manual review confirms legitimacy — no
 * auto-action against the leaderboard, just human verification that
 * top-of-board entries aren't celebrity photos / synthesised faces.
 */
async function persistScanHistory(
  userId: string,
  scores: ReturnType<typeof combineScores>,
  vision: VisionScore,
  imageBase64: string | undefined,
): Promise<void> {
  try {
    const scanId = crypto.randomUUID();
    let imagePath: string | null = null;
    const requiresReview = scores.overall >= PHOTO_REQUIRED_THRESHOLD;

    // Image upload (best-effort): if it fails we still write the
    // scan_history row so stats / improvement calculations stay
    // accurate. The image_path column is nullable for that reason.
    if (imageBase64) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const decoded = decodeBase64(imageBase64);
        if (decoded && decoded.byteLength <= MAX_BYTES) {
          const mime = detectMime(decoded);
          if (mime === 'image/jpeg' || mime === 'image/png') {
            const ext = mime === 'image/png' ? 'png' : 'jpg';
            const path = `${userId}/${scanId}.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from(SCANS_BUCKET)
              .upload(path, decoded, {
                contentType: mime,
                cacheControl: '3600',
                upsert: false, // scan_id is unique; never overwrite
              });
            if (!uploadErr) {
              imagePath = path;
            }
          }
        }
      }
    }

    const pool = getPool();
    await pool.query(
      `insert into scan_history
         (id, user_id, overall, jawline, eyes, skin, cheekbones, presentation, vision, image_path, requires_review)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        scanId,
        userId,
        scores.overall,
        scores.sub.jawline,
        scores.sub.eyes,
        scores.sub.skin,
        scores.sub.cheekbones,
        scores.presentation ?? null,
        JSON.stringify(vision),
        imagePath,
        requiresReview,
      ],
    );

    if (requiresReview && imagePath) {
      void notifyAdminOfHighScoreScan({
        userId,
        scanId,
        overall: scores.overall,
        imagePath,
      });
    }
  } catch {
    // best-effort
  }
}

/**
 * Email the configured admin address with a link to the high-score
 * scan for manual review. Best-effort; failure doesn't surface to the
 * user. The link goes to a short-lived signed URL so the admin
 * doesn't need to log into Supabase to see it.
 */
async function notifyAdminOfHighScoreScan(args: {
  userId: string;
  scanId: string;
  overall: number;
  imagePath: string;
}): Promise<void> {
  const adminTo = process.env.ADMIN_REVIEW_EMAIL;
  if (!adminTo) return;
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    const { data: signed } = await supabase.storage
      .from(SCANS_BUCKET)
      .createSignedUrl(args.imagePath, 60 * 60 * 24 * 7); // 7 days
    if (!signed?.signedUrl) return;

    const subject = `holymog · high-score review · ${args.overall}`;
    const html = `<!doctype html><html><body style="font-family:sans-serif;margin:24px;background:#0a0a0a;color:#f5f5f5;">
      <h2>High-score scan flagged for review</h2>
      <p><strong>User ID:</strong> ${args.userId}</p>
      <p><strong>Scan ID:</strong> ${args.scanId}</p>
      <p><strong>Overall:</strong> ${args.overall} (≥ ${PHOTO_REQUIRED_THRESHOLD})</p>
      <p><a href="${signed.signedUrl}" style="color:#38bdf8;">view scan image</a> (7-day signed link)</p>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
        Review for legitimacy only — verify the face appears to belong
        to the user. No auto-action; this is a human-in-the-loop
        anti-cheat check on top-of-board entries.
      </p>
      <p style="color:#71717a;font-size:11px;">
        <a href="${appUrl('/account/' + args.userId)}" style="color:#71717a;">user profile</a>
      </p>
    </body></html>`;
    await sendEmail({
      to: adminTo,
      subject,
      html,
      text: `High-score scan ${args.overall} from ${args.userId}\n\n${signed.signedUrl}`,
      tags: [{ name: 'kind', value: 'high_score_review' }],
    });
  } catch {
    // best-effort
  }
}

async function persistBestScanIfBeaten(
  userId: string,
  vision: VisionScore,
): Promise<void> {
  try {
    const final = combineScores(vision);
    const pool = getPool();
    await pool.query(
      `update profiles
          set best_scan = $1::jsonb,
              best_scan_overall = $2
        where user_id = $3
          and (best_scan_overall is null or best_scan_overall < $2)`,
      [
        JSON.stringify({ vision, scores: final }),
        final.overall,
        userId,
      ],
    );
  } catch {
    // never block the response
  }
}

