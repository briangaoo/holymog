import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/account/sessions/[id] — kick a specific session by its
 * opaque id (sha256-truncated session-token, returned by GET above).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const pool = getPool();
  const rows = await pool.query<{ sessionToken: string }>(
    `select "sessionToken" from sessions where "userId" = $1`,
    [session.user.id],
  );
  const target = rows.rows.find((r) => hashToken(r.sessionToken) === id);
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  await pool.query(
    `delete from sessions where "sessionToken" = $1 and "userId" = $2`,
    [target.sessionToken, session.user.id],
  );
  return NextResponse.json({ ok: true });
}

function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('base64url')
    .slice(0, 16);
}
