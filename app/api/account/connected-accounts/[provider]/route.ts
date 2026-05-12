import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 'email' is a synthetic provider that maps to clearing the user's
// `emailVerified` timestamp (which is what gates magic-link sign-in).
const ALLOWED_PROVIDERS = new Set(['google', 'apple', 'github', 'email']);

/**
 * DELETE /api/account/connected-accounts/[provider]
 *
 * Unlinks a sign-in method from the user's account. For OAuth
 * providers (google/apple/github) this deletes the row from the
 * Auth.js `accounts` table. For the synthetic `email` provider it
 * clears `emailVerified` so the magic-link path no longer recognises
 * the address.
 *
 * Refuses to unlink the LAST sign-in method (would lock the user
 * out) — returns 409 in that case so the UI can surface a friendly
 * message.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { provider } = await params;
  const normalised = provider.toLowerCase();
  if (!ALLOWED_PROVIDERS.has(normalised)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }

  const pool = getPool();

  // Count remaining sign-in methods AFTER this unlink.
  const accounts = await pool.query<{ provider: string }>(
    `select provider from accounts where "userId" = $1`,
    [session.user.id],
  );
  const emailAuthRow = await pool.query<{ exists: boolean }>(
    `select exists(
       select 1 from users where id = $1 and email is not null and "emailVerified" is not null
     ) as exists`,
    [session.user.id],
  );
  const hasEmailAuthAfter =
    normalised === 'email'
      ? false
      : emailAuthRow.rows[0]?.exists ?? false;
  const otherOauthAfter = accounts.rows.filter(
    (r) => r.provider !== normalised,
  );

  if (otherOauthAfter.length === 0 && !hasEmailAuthAfter) {
    return NextResponse.json(
      {
        error: 'last_signin_method',
        message:
          'This is your only sign-in method. Add another method before removing this one — otherwise you’d be locked out.',
      },
      { status: 409 },
    );
  }

  if (normalised === 'email') {
    // Clear the verified timestamp; the magic-link provider only signs
    // a user in when `users.emailVerified is not null`. Keeping the
    // address itself (users.email) so re-adding email later works.
    const result = await pool.query(
      `update users set "emailVerified" = NULL where id = $1 and "emailVerified" is not null`,
      [session.user.id],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'not_linked' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const result = await pool.query(
    `delete from accounts where "userId" = $1 and provider = $2`,
    [session.user.id, normalised],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'not_linked' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
