import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PROVIDERS = new Set(['google', 'apple', 'github']);

/**
 * DELETE /api/account/connected-accounts/[provider] — unlink an OAuth
 * provider from the user's account. Refuses to unlink the LAST sign-in
 * method (would lock the user out): if the user has no email-auth +
 * only this OAuth, return 409.
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

  // Lockout guard: count remaining sign-in methods AFTER this unlink.
  const accounts = await pool.query<{ provider: string }>(
    `select provider from accounts where "userId" = $1`,
    [session.user.id],
  );
  const others = accounts.rows.filter((r) => r.provider !== normalised);
  const emailAuth = await pool.query<{ exists: boolean }>(
    `select exists(
       select 1 from users where id = $1 and email is not null and "emailVerified" is not null
     ) as exists`,
    [session.user.id],
  );
  const hasEmailAuth = emailAuth.rows[0]?.exists ?? false;
  if (others.length === 0 && !hasEmailAuth) {
    return NextResponse.json(
      {
        error: 'last_signin_method',
        message:
          'This is your only sign-in method. Add a magic-link email or another provider before unlinking.',
      },
      { status: 409 },
    );
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
