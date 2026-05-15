import { NextResponse, type NextRequest } from 'next/server';
import { getPool } from './lib/db';

/**
 * Next.js 16 proxy.ts — runs before any route handler. We use it to
 * hide /admin and /api/admin/* from anyone not on the
 * ADMIN_USER_IDS allowlist.
 *
 * Stealth model:
 *   - For non-admins, rewrite to a non-existent path. Next then
 *     renders its real `_not-found` segment so the response body
 *     (including the RSC payload's `["", "_not-found"]` route tree)
 *     is byte-identical to what curl gets hitting /banana123.
 *   - For admins, NextResponse.next() lets the request fall through
 *     to the page / route handler, which then does its own
 *     defense-in-depth admin re-check.
 *
 * Why proxy and not just `notFound()` in the page:
 *   notFound() called from inside /admin's page renders the
 *   `_not-found` UI BUT the RSC payload still contains
 *   `["", "admin"]` as the matched route segment. Hitting a non-
 *   existent path gives `["", "_not-found"]`. That difference is a
 *   one-bit oracle for "/admin exists." Proxy fixes this by
 *   rewriting before route resolution, so Next has no /admin
 *   segment in its tree for the response at all.
 *
 * Why manual session lookup and not `auth()` from lib/auth.ts:
 *   Auth.js v5 in proxy works, but pulls the full NextAuth +
 *   pg-adapter graph into the proxy chunk. A direct one-row session
 *   lookup against `sessions` is faster, has no startup cost, and
 *   cannot inadvertently call the signIn callback or trigger any
 *   account-creation side effect on a probe request.
 *
 * Fail-closed: any unexpected error (no DB, no env, malformed
 * cookie, lookup throws) is treated as "not admin" and triggers the
 * rewrite. The admin can never be locked out by this proxy because
 * a logged-in non-admin / logged-out user sees the same 404 as
 * before — the only path that lights up the page is "you have a
 * valid session AND your user id is on the allowlist."
 */

export const config = {
  // Limit proxy work to admin surfaces. Every other request bypasses
  // this proxy entirely (Next short-circuits on matcher misses).
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};

// Fixed sink path. Doesn't exist in /app, so Next resolves it to its
// internal `_not-found` and renders the framework 404. Using a stable
// string (not a random one) keeps the response cacheable in the
// edge / browser the same way a real 404 is — randomizing per
// request would itself become a timing / cache fingerprint.
const STEALTH_REWRITE = '/_hm_no_route';

// Auth.js v5 cookie names. Production uses the __Secure- prefix when
// AUTH_COOKIE_DOMAIN is set; dev uses the bare name. We try both so
// the proxy works in either environment without conditional logic.
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
];

function readAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readSessionToken(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const v = request.cookies.get(name)?.value;
    if (v) return v;
  }
  return null;
}

function stealthResponse(request: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL(STEALTH_REWRITE, request.url));
}

export async function proxy(request: NextRequest) {
  const adminIds = readAdminIds();
  if (adminIds.length === 0) {
    // No admins configured → there is no admin surface, period.
    return stealthResponse(request);
  }

  const sessionToken = readSessionToken(request);
  if (!sessionToken) {
    return stealthResponse(request);
  }

  let userId: string | null = null;
  try {
    const pool = getPool();
    // Auth.js v5 pg-adapter table is `sessions` with columns
    // sessionToken, userId, expires (camelCase, quoted).
    const r = await pool.query<{ userId: string }>(
      'select "userId" from sessions where "sessionToken" = $1 and expires > now() limit 1',
      [sessionToken],
    );
    userId = r.rows[0]?.userId ?? null;
  } catch {
    // DB hiccup or proxy bundle issue → fail closed. Real admins
    // get a transient 404; that's strictly better than leaking the
    // route's existence under any error condition.
    return stealthResponse(request);
  }

  if (!userId || !adminIds.includes(userId)) {
    return stealthResponse(request);
  }

  return NextResponse.next();
}
