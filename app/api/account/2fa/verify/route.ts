import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import {
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
  totpVerify,
} from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/2fa/verify { code }
 *
 * Confirms the user can produce a valid TOTP from the secret stored
 * during /setup. Flips `two_factor_enabled = true` and generates 8
 * one-shot backup codes (returned plaintext ONCE; stored sha256-hashed
 * in `two_factor_backup_codes`).
 *
 * If verification fails, the secret stays in place (user can retry).
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
  const row = await pool.query<{ two_factor_secret: string | null }>(
    `select two_factor_secret from profiles where user_id = $1 limit 1`,
    [user.id],
  );
  const encrypted = row.rows[0]?.two_factor_secret;
  if (!encrypted) {
    return NextResponse.json({ error: 'no_secret' }, { status: 409 });
  }

  let secret: string;
  try {
    secret = decryptSecret(encrypted);
  } catch {
    return NextResponse.json({ error: 'corrupt_secret' }, { status: 500 });
  }

  if (!totpVerify(secret, code)) {
    return NextResponse.json({ error: 'wrong_code' }, { status: 400 });
  }

  // Generate backup codes and store hashed.
  const plaintextCodes = generateBackupCodes(8);
  const hashed = plaintextCodes.map(hashBackupCode);
  await pool.query(
    `update profiles
        set two_factor_enabled = true,
            two_factor_backup_codes = $1
      where user_id = $2`,
    [hashed, user.id],
  );

  return NextResponse.json({
    ok: true,
    backup_codes: plaintextCodes,
  });
}
