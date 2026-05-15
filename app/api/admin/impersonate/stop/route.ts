import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
} from '@/lib/admin';
import { requireSameOrigin } from '@/lib/originGuard';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * End impersonation. Clears the cookie unconditionally — the admin's
 * underlying Auth.js session is untouched. We deliberately do NOT
 * gate this on requireAdmin: a runaway impersonation state should be
 * exitable even if the admin id was just removed from the env
 * allowlist, and any non-admin who somehow has the cookie set
 * (shouldn't happen, but defense in depth) can also clear it.
 *
 * Returns 200 even when no cookie is present so the UI can call it
 * idempotently from anywhere — refresh, navigation, banner button —
 * without having to introspect cookies first.
 */
export async function POST(request: Request) {
  const guard = requireSameOrigin(request);
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  // Best-effort audit: when the cookie is valid, record who was acting
  // as whom. Failures here don't block the clear path.
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    const verified = verifyImpersonationCookie(value);
    if (verified) {
      void recordAudit({
        userId: verified.adminUserId,
        action: 'admin_impersonate_stop',
        resource: verified.targetUserId,
      });
    }
  } catch {
    // ignore
  }

  const res = NextResponse.json({ ok: true });
  // Setting maxAge to 0 with same name + path is how you delete a
  // cookie via a Set-Cookie header. delete() does the same thing but
  // setting it explicitly here keeps the production vs dev secure
  // flag aligned with how we set it on start.
  res.cookies.set({
    name: IMPERSONATION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
