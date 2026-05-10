import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { detokenize } from '@/lib/totp';
import { appUrl } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = {
  user_id: string;
  new_email: string;
  kind: string;
};

/**
 * GET /api/account/email/verify?token=...
 *
 * Token-only — the user clicks this from their email inbox while
 * potentially signed-out. We verify the HMAC and TTL, then update
 * `users.email`. Redirect back to /account with a success or error
 * banner via query param.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';
  if (!token) {
    return redirectWithStatus('error', 'missing_token');
  }
  const payload = detokenize<Payload>(token);
  if (!payload || payload.kind !== 'email_change') {
    return redirectWithStatus('error', 'invalid_or_expired');
  }

  const pool = getPool();
  // Re-check that the new email isn't taken between now and the click
  // (a different user may have signed up with it in the gap).
  const taken = await pool.query<{ id: string }>(
    `select id from users where lower(email) = $1 and id <> $2 limit 1`,
    [payload.new_email, payload.user_id],
  );
  if (taken.rows.length > 0) {
    return redirectWithStatus('error', 'email_taken');
  }

  const result = await pool.query(
    `update users
        set email = $1,
            "emailVerified" = now()
      where id = $2`,
    [payload.new_email, payload.user_id],
  );
  if (result.rowCount === 0) {
    return redirectWithStatus('error', 'user_missing');
  }

  return redirectWithStatus('success', 'email_changed');
}

function redirectWithStatus(kind: 'success' | 'error', code: string) {
  const url = new URL(appUrl('/account'));
  url.searchParams.set(kind, code);
  return NextResponse.redirect(url, { status: 303 });
}
