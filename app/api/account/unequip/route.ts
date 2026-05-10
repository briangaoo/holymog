import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['frame', 'theme', 'flair', 'name_fx']);

/**
 * POST /api/account/unequip { kind: 'frame' | 'theme' | 'flair' }
 *
 * Clears the corresponding `equipped_*` slot. No ownership check —
 * users can always unequip; equipping is the gated action.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { kind?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.kind !== 'string' || !VALID_KINDS.has(body.kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }

  const column =
    body.kind === 'frame'
      ? 'equipped_frame'
      : body.kind === 'theme'
        ? 'equipped_theme'
        : body.kind === 'name_fx'
          ? 'equipped_name_fx'
          : 'equipped_flair';

  const pool = getPool();
  await pool.query(`update profiles set ${column} = null where user_id = $1`, [
    user.id,
  ]);

  return NextResponse.json({ ok: true });
}
