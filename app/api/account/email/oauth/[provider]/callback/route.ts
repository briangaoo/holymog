import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { appUrl, sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  sub?: string;
};

/**
 * GET /api/account/email/oauth/[provider]/callback
 *
 * Completes the OAuth-based email-change flow started at
 * /api/account/email/oauth/[provider]/start. We verify the HMAC state
 * (locking this callback to the originating user), exchange the
 * authorization code for an ID token, pull the verified email out of
 * the userinfo response, and update users.email — without touching the
 * existing session or creating any new accounts.
 *
 * Side effects:
 *   - Emails the OLD address with an alert (best-effort) so an account
 *     hijacker can't quietly swap addresses.
 *   - Redirects back to /account?tab=settings with a status query.
 *
 * Refuses to update when:
 *   - New email equals current email (same_email)
 *   - New email is already in use by another holymog user (email_taken)
 *   - Google reports the email as unverified (email_unverified)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser) {
    return redirectWithStatus('signed_out');
  }

  const { provider } = await params;
  if (provider !== 'google') {
    return redirectWithStatus('unknown_provider');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return redirectWithStatus(`oauth_${oauthError}`);
  }
  if (!code || !state) {
    return redirectWithStatus('missing_params');
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return redirectWithStatus('unconfigured');

  // Parse + verify state: <userId>:<expiresMs>:<hmac>.
  const parts = state.split(':');
  if (parts.length !== 3) return redirectWithStatus('bad_state');
  const [userId, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return redirectWithStatus('state_expired');
  }
  if (userId !== sessionUser.id) {
    return redirectWithStatus('state_user_mismatch');
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${expires}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return redirectWithStatus('bad_state');
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithStatus('oauth_not_configured');
  }

  // Exchange the code for tokens.
  const redirectUri = appUrl(`/api/account/email/oauth/${provider}/callback`);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return redirectWithStatus('token_exchange_failed');
  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenData.access_token) return redirectWithStatus('no_access_token');

  // Fetch verified email from Google's userinfo endpoint.
  const infoRes = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );
  if (!infoRes.ok) return redirectWithStatus('userinfo_failed');
  const info = (await infoRes.json()) as GoogleUserInfo;

  const newEmail = (info.email ?? '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(newEmail)) return redirectWithStatus('invalid_email');
  if (info.email_verified === false) {
    return redirectWithStatus('email_unverified');
  }

  // Apply the change.
  const pool = getPool();
  const me = await pool.query<{ email: string | null }>(
    `select email from users where id = $1 limit 1`,
    [sessionUser.id],
  );
  const oldEmail = me.rows[0]?.email ?? null;
  if (newEmail === oldEmail) return redirectWithStatus('same_email');

  const taken = await pool.query<{ id: string }>(
    `select id from users where lower(email) = $1 and id <> $2 limit 1`,
    [newEmail, sessionUser.id],
  );
  if (taken.rows.length > 0) return redirectWithStatus('email_taken');

  await pool.query(
    `update users set email = $1, "emailVerified" = now() where id = $2`,
    [newEmail, sessionUser.id],
  );

  // Best-effort: alert the OLD address that the change happened.
  if (oldEmail && oldEmail !== newEmail) {
    void sendEmail({
      to: oldEmail,
      subject: 'your holymog email was changed',
      html: `<p>Your account email was changed from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong> via Google re-authentication.</p><p>If this wasn't you, sign in immediately and revoke other sessions at <a href="${appUrl('/account?tab=settings')}">${appUrl('/account?tab=settings')}</a>.</p>`,
      text: `Your holymog email was changed from ${oldEmail} to ${newEmail}. If this wasn't you, revoke other sessions at ${appUrl('/account?tab=settings')}.`,
      tags: [{ name: 'kind', value: 'email_change_oauth_alert' }],
    });
  }

  return redirectWithStatus('ok');
}

function redirectWithStatus(status: string) {
  const dest = `${appUrl('/account?tab=settings&email_changed=')}${encodeURIComponent(status)}`;
  return NextResponse.redirect(dest, 307);
}
