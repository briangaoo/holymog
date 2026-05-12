import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { appUrl } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * GET /api/account/email/oauth/[provider]/start
 *
 * Kicks off an OAuth-based email-change flow. Required for users whose
 * account is OAuth-only: instead of typing a new email and clicking a
 * link (the magic-link path), they re-authenticate with the OAuth
 * provider under their NEW email account, and we capture that email
 * from the OAuth response.
 *
 * Unlike Auth.js's signIn flow this DOES NOT sign the user into the
 * new OAuth account — it only verifies ownership of the new email so
 * we can update the existing user's email column. The current session
 * stays intact throughout.
 *
 * Caller must already be signed in. Returns a 307 redirect to the
 * provider's authorize URL with an HMAC-signed state token tying the
 * eventual callback back to this user.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { provider } = await params;
  if (provider !== 'google') {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'oauth_not_configured' },
      { status: 503 },
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  // State: <userId>:<expiresMs>:<hmac>. HMAC seals the (userId, expires)
  // pair so a stolen state can't be re-used and can't be re-targeted.
  const expires = Date.now() + STATE_TTL_MS;
  const payload = `${user.id}:${expires}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const state = `${payload}:${sig}`;

  const redirectUri = `${appUrl(`/api/account/email/oauth/${provider}/callback`)}`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'online');
  // Force account chooser so the user can pick a DIFFERENT account
  // than the one they're currently signed in as on Google.
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString(), 307);
}
