import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SessionRow = {
  sessionToken: string;
  expires: Date;
};

/**
 * GET /api/account/sessions — list the user's Auth.js sessions.
 *
 * Auth.js stores sessions in a `sessions` table managed by the
 * `@auth/pg-adapter`. We don't surface the raw token to the client
 * (anyone holding it could authenticate); we hash it to a stable id
 * the kick endpoint can reverse-lookup. Truncated current-session
 * marker so the user can identify "this device" in the list.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  const rows = await pool.query<SessionRow>(
    `select "sessionToken", expires
       from sessions
      where "userId" = $1
      order by expires desc`,
    [session.user.id],
  );

  // Pull the caller's session-token cookie so we can mark "current".
  const cookieHeader = request.headers.get('cookie') ?? '';
  const currentToken = extractSessionToken(cookieHeader);

  return NextResponse.json({
    sessions: rows.rows.map((row) => ({
      id: hashToken(row.sessionToken),
      // Expires-as-creation is rough — Auth.js doesn't store creation
      // time, only expires. With a 30-day rolling window this is good
      // enough for "last activity" cues.
      expires_at: row.expires.toISOString(),
      current: currentToken !== null && row.sessionToken === currentToken,
    })),
  });
}

/**
 * DELETE /api/account/sessions — kick everything except the current
 * session. Useful for "I just changed my password / suspect a breach".
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const currentToken = extractSessionToken(cookieHeader);

  const pool = getPool();
  if (currentToken) {
    await pool.query(
      `delete from sessions where "userId" = $1 and "sessionToken" <> $2`,
      [session.user.id, currentToken],
    );
  } else {
    await pool.query(`delete from sessions where "userId" = $1`, [
      session.user.id,
    ]);
  }

  return NextResponse.json({ ok: true });
}

// ---- Helpers --------------------------------------------------------------

function hashToken(token: string): string {
  // Stable opaque id — base64url of first 12 bytes of sha256. The DELETE
  // [id] endpoint reverses this by scanning the user's sessions and
  // hashing each. Cheap because each user has very few sessions.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('base64url').slice(0, 16);
}

function extractSessionToken(cookieHeader: string): string | null {
  // Auth.js v5 cookie names: `authjs.session-token` (or `__Secure-` prefix in prod).
  const candidates = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
  ];
  for (const name of candidates) {
    const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
    const match = cookieHeader.match(re);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}
