import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import {
  encryptSecret,
  generateSecret,
  totpUri,
} from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/2fa/setup
 *
 * Generates a new TOTP secret for the user and stores it encrypted in
 * profiles.two_factor_secret. The secret is returned ONCE here so the
 * UI can show the otpauth:// URI + plaintext secret to add to an
 * authenticator app. `two_factor_enabled` stays false until /verify
 * confirms the user can produce a current code.
 *
 * Re-running this overwrites the previous secret — that's intentional
 * for "I lost my authenticator, let me reset" flows. (Lockout is
 * impossible while we don't enforce 2FA at sign-in yet; once we do,
 * a recovery flow with backup codes covers this.)
 */
export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json({ error: 'no_email' }, { status: 400 });
  }

  const secret = generateSecret();
  const encrypted = encryptSecret(secret);

  const pool = getPool();
  await pool.query(
    `update profiles
        set two_factor_secret = $1,
            two_factor_enabled = false
      where user_id = $2`,
    [encrypted, user.id],
  );

  return NextResponse.json({
    secret,
    uri: totpUri({ secret, account: user.email, issuer: 'holymog' }),
  });
}
