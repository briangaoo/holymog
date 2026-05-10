import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { decryptSecret, hashBackupCode, totpVerify } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/2fa/disable { code }
 *
 * Turning 2FA off requires producing a valid TOTP code OR an unused
 * backup code — same friction as a real second-factor verification.
 * Without that we'd let an attacker who phished one session disable
 * the second factor and persist.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.code !== 'string') {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }
  const code = body.code.trim().replace(/\s+/g, '');

  const pool = getPool();
  const row = await pool.query<{
    two_factor_secret: string | null;
    two_factor_enabled: boolean;
    two_factor_backup_codes: string[] | null;
  }>(
    `select two_factor_secret, two_factor_enabled, two_factor_backup_codes
       from profiles where user_id = $1 limit 1`,
    [user.id],
  );
  const r = row.rows[0];
  if (!r || !r.two_factor_enabled) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 409 });
  }

  // Verify the code: TOTP first, fallback to backup codes.
  let allowed = false;
  if (r.two_factor_secret) {
    try {
      if (totpVerify(decryptSecret(r.two_factor_secret), code)) {
        allowed = true;
      }
    } catch {
      // fall through to backup codes
    }
  }
  if (!allowed) {
    const hashed = hashBackupCode(code);
    if ((r.two_factor_backup_codes ?? []).includes(hashed)) {
      allowed = true;
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: 'wrong_code' }, { status: 400 });
  }

  await pool.query(
    `update profiles
        set two_factor_enabled = false,
            two_factor_secret = null,
            two_factor_backup_codes = array[]::text[]
      where user_id = $1`,
    [user.id],
  );

  return NextResponse.json({ ok: true });
}
