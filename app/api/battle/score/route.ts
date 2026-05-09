import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { analyzeBattle } from '@/lib/vision';
import { broadcastBattleEvent } from '@/lib/realtime';

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

  const buffer = decodeBase64(body.imageBase64);
  if (!buffer) return NextResponse.json({ error: 'decode_failed' }, { status: 400 });
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  if (!process.env.GEMINI_API_KEY) {
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
    if (elapsedMs < -1000 || elapsedMs > 11000) {
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
  // boundary if anything fails.
  const client = await pool.connect();
  try {
    await client.query('begin');

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
