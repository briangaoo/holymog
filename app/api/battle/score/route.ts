import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { analyzeBattle } from '@/lib/vision';
import { broadcastBattleEvent } from '@/lib/realtime';
import { getRatelimit } from '@/lib/ratelimit';
import { requireSameOrigin } from '@/lib/originGuard';
import { isBattlesKilled } from '@/lib/featureFlags';
import { publicError } from '@/lib/errors';
import { checkBudget } from '@/lib/costCap';
import { BATTLES_BUCKET, getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

type Body = { battle_id?: unknown; imageBase64?: unknown };

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

/**
 * POST /api/battle/score
 *
 * Per-frame scoring during a battle's active window. Validates
 * participation + state + timing window, calls the lightweight
 * Gemini prompt, updates the participant's peak_score, broadcasts
 * the result over Supabase Realtime so opponents' tiles update,
 * and increments the user's lifetime improvement_counts (used
 * by Phase 3's "most-called weakness" stat).
 */
export async function POST(request: Request) {
  if (isBattlesKilled()) {
    return NextResponse.json(publicError('system_unavailable'), { status: 503 });
  }
  const budget = await checkBudget();
  if (!budget.ok) {
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.battle_id !== 'string' || typeof body.imageBase64 !== 'string') {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  const battleId = body.battle_id;

  // Cap each user's score-call rate per battle. The active phase
  // legitimately fires ~10 calls over 11 seconds; 30/min is comfortable
  // headroom and bounds the cost ceiling per battle if a client misbehaves.
  const limiter = getRatelimit('battleScore');
  if (limiter) {
    const result = await limiter.limit(`${user.id}:${battleId}`);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  const buffer = decodeBase64(body.imageBase64);
  if (!buffer) return NextResponse.json({ error: 'decode_failed' }, { status: 400 });
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  if (!process.env.VERTEX_API_KEY) {
    return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 });
  }

  const pool = getPool();

  // Validate: battle is in 'active' state, started_at + 11s hasn't passed,
  // user is a participant.
  const validation = await pool.query<{ state: string; started_at: Date | null }>(
    `select b.state, b.started_at
       from battles b
       join battle_participants p on p.battle_id = b.id
      where b.id = $1 and p.user_id = $2
      limit 1`,
    [battleId, user.id],
  );
  if (validation.rows.length === 0) {
    return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });
  }
  const { state, started_at } = validation.rows[0];

  if (state !== 'active' && state !== 'starting') {
    return NextResponse.json({ error: 'battle_not_active' }, { status: 409 });
  }
  if (started_at) {
    const elapsedMs = Date.now() - started_at.getTime();
    // Window: from started_at - 1s (catches the warmup call right before
    // the active phase begins) to started_at + 11s (10s active + 1s grace).
    // -3000 accommodates the client's pre-fire (PRE_FIRE_LEAD_MS = 2000)
    // plus a 1s buffer for clock skew + countdown lead-in. +11000 keeps
    // the original 1-second post-end grace.
    if (elapsedMs < -3000 || elapsedMs > 11000) {
      return NextResponse.json({ error: 'outside_window' }, { status: 409 });
    }
  }

  // Score the frame.
  const mime = detectMime(buffer);
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const blob = new Blob([ab as ArrayBuffer], { type: mime });

  let result;
  try {
    result = await analyzeBattle(blob);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision_error';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Update participant peak_score; bump lifetime improvement counter.
  // Both happen in one connection so they share the same transaction
  // boundary if anything fails. We also figure out whether THIS call
  // produced a new peak — if so, the image becomes the per-user peak
  // frame in the `holymog-battles` bucket (used by the moderation
  // review path on /api/battle/report).
  let isNewPeak = false;
  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await client.query<{ peak_score: number }>(
      `select peak_score from battle_participants
        where battle_id = $1 and user_id = $2
        for update`,
      [battleId, user.id],
    );
    const oldPeak = before.rows[0]?.peak_score ?? 0;
    isNewPeak = result.overall > oldPeak;

    await client.query(
      `update battle_participants
          set peak_score = greatest(peak_score, $1)
        where battle_id = $2 and user_id = $3`,
      [result.overall, battleId, user.id],
    );

    await client.query(
      `update profiles
          set improvement_counts = jsonb_set(
                coalesce(improvement_counts, '{}'::jsonb),
                ARRAY[$1::text],
                to_jsonb(coalesce((improvement_counts->>$1)::int, 0) + 1),
                true
              )
        where user_id = $2`,
      [result.improvement, user.id],
    );

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'db_update_failed' },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  // Persist the peak frame post-commit. We don't need this in the
  // critical path — score updates broadcast regardless — but doing it
  // sync lets us audit the image-write failure mode without a separate
  // queue. Path is stable per (battle, user) so re-peak just overwrites.
  // Public + private battles both save (the report surface gates
  // public-only but evidence may still be needed for private complaints
  // routed manually through hello@holymog.com).
  if (isNewPeak) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const path = `${battleId}/${user.id}.jpg`;
      try {
        await supabase.storage.from(BATTLES_BUCKET).upload(path, buffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });
        await pool
          .query(
            `update battle_participants
                set peak_image_path = $1
              where battle_id = $2 and user_id = $3`,
            [path, battleId, user.id],
          )
          .catch(() => {
            // peak_image_path column may not exist yet on older deploys;
            // soft-fail so scoring keeps working.
          });
      } catch {
        // Storage hiccup — broadcast still goes out so gameplay is
        // unaffected. The next peak will retry.
      }
    }
  }

  // Read the (possibly updated) peak so we can broadcast it.
  const peakResult = await pool.query<{ peak_score: number }>(
    `select peak_score from battle_participants
      where battle_id = $1 and user_id = $2`,
    [battleId, user.id],
  );
  const peak = peakResult.rows[0]?.peak_score ?? result.overall;

  // Broadcast to all subscribers (including the caller — the client
  // updates UI from the broadcast, not from the response, to avoid
  // double-applying values).
  void broadcastBattleEvent(battleId, 'score.update', {
    user_id: user.id,
    overall: result.overall,
    improvement: result.improvement,
    peak,
    ts: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
