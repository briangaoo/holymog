import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { combineScores } from '@/lib/scoreEngine';
import type { VisionScore } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { vision?: unknown };

const VISION_KEYS: ReadonlyArray<keyof VisionScore> = [
  'jawline_definition',
  'chin_definition',
  'cheekbone_prominence',
  'nose_shape',
  'nose_proportion',
  'forehead_proportion',
  'temple_hollow',
  'ear_shape',
  'facial_thirds_visual',
  'eye_size',
  'eye_shape',
  'eye_bags',
  'canthal_tilt',
  'iris_appeal',
  'brow_shape',
  'brow_thickness',
  'lip_shape',
  'lip_proportion',
  'philtrum',
  'skin_clarity',
  'skin_evenness',
  'skin_tone',
  'hair_quality',
  'hair_styling',
  'posture',
  'confidence',
  'masculinity_femininity',
  'symmetry',
  'feature_harmony',
  'overall_attractiveness',
];

function validateVision(input: unknown): VisionScore | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const k of VISION_KEYS) {
    const v = obj[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      return null;
    }
    out[k] = Math.round(v);
  }
  return out as unknown as VisionScore;
}

/**
 * POST /api/account/migrate-scan
 *
 * Lifts a scan recorded in localStorage (typically captured before
 * the user signed up) into their profile.best_scan. Used by the
 * post-sign-in migration watcher: when a freshly authenticated
 * client detects a `holymog-last-result` blob, it posts here once
 * and clears local storage. Idempotent — multiple calls are safe;
 * the conditional update only writes if the new score beats the
 * stored best.
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

  const vision = validateVision(body.vision);
  if (!vision) {
    return NextResponse.json({ error: 'invalid_vision' }, { status: 400 });
  }

  const scores = combineScores(vision);
  const overall = scores.overall;
  const payload = JSON.stringify({ vision, scores });

  const pool = getPool();
  // Conditional write: only persist when the new overall beats the
  // stored best (or there is no stored best yet). Race-safe.
  const result = await pool.query<{ best_scan_overall: number | null }>(
    `update profiles
        set best_scan_overall = $1,
            best_scan = $2::jsonb
      where user_id = $3
        and (best_scan_overall is null or best_scan_overall < $1)
      returning best_scan_overall`,
    [overall, payload, user.id],
  );

  return NextResponse.json({
    ok: true,
    persisted: (result.rowCount ?? 0) > 0,
    overall,
  });
}
