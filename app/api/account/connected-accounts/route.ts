import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccountRow = {
  provider: string;
  type: string;
};

/**
 * GET /api/account/connected-accounts — list OAuth providers the user
 * has linked. Reads straight from the Auth.js `accounts` table, exposing
 * only `{ provider, type }` so we never leak access tokens or refresh
 * tokens to the client.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  const rows = await pool.query<AccountRow>(
    `select provider, type from accounts where "userId" = $1 order by provider asc`,
    [session.user.id],
  );

  // Detect whether the user signed up with magic link (no `accounts`
  // row but a verified email). Lets the UI render "email + N OAuth
  // providers" honestly.
  const hasEmailAuth = await pool.query<{ exists: boolean }>(
    `select exists(
       select 1 from users where id = $1 and email is not null and "emailVerified" is not null
     ) as exists`,
    [session.user.id],
  );

  return NextResponse.json({
    accounts: rows.rows.map((r) => ({ provider: r.provider, type: r.type })),
    has_email_auth: hasEmailAuth.rows[0]?.exists ?? false,
  });
}
