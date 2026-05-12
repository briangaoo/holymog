/**
 * Origin / Referer enforcement for state-mutation endpoints.
 *
 * Browsers attach the `Origin` header (or fallback `Referer`) on
 * POST/PUT/DELETE/PATCH requests. Cross-origin scripts can't forge it
 * without the user's full cooperation. Off-the-shelf bots and SSRF
 * abuse tools rarely set it correctly, so this raises the bar on:
 *   - Other sites embedding our endpoints as a free Gemini face-scoring
 *     proxy.
 *   - Form-action CSRF where Auth.js's SameSite=Lax cookie + this
 *     check together close the gap.
 *
 * Caveat: a determined attacker with a custom backend can spoof Origin.
 * The hard ceiling on cost abuse is the daily Gemini budget cap (Phase
 * 6) + kill switches. Origin guard is the cheap first line, not the
 * last one.
 */

// Localhost entries are dev-only. Leaving them in the production allow-list
// would let a server-side attacker forge `Origin: http://localhost:3000` from
// curl/Python and pass the same-origin gate — Origin is the cheap first line
// and that hole defeats the point.
// Canonical host is holymog.com (apex, no www). The www.holymog.com
// entry is kept as a courtesy in case a user types it directly — the
// vercel.com domain redirect catches that — but we never link to it
// ourselves. Localhost entries are dev-only.
const FALLBACK_HOSTS = [
  'https://holymog.com',
  'https://www.holymog.com',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : []),
];

// Hosts we accept as the request origin. NEXT_PUBLIC_APP_URL is the
// canonical one; the .vercel.app fallback covers the current production
// URL; localhost covers dev.
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  [process.env.NEXT_PUBLIC_APP_URL, ...FALLBACK_HOSTS]
    .filter((s): s is string => Boolean(s))
    .map((s) => {
      try {
        return new URL(s).host;
      } catch {
        return null;
      }
    })
    .filter((s): s is string => s !== null),
);

export type OriginCheck =
  | { ok: true }
  | { ok: false; status: number; body: { error: string } };

/**
 * Returns `{ ok: true }` when the request originates from an allowed
 * host, otherwise a 403 response payload ready to JSON-serialize.
 *
 * Usage:
 *   const guard = requireSameOrigin(request);
 *   if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
 */
export function requireSameOrigin(request: Request): OriginCheck {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  let host = '';
  if (origin && origin !== 'null') {
    try {
      host = new URL(origin).host;
    } catch {
      // fall through to referer
    }
  }
  if (!host && referer) {
    try {
      host = new URL(referer).host;
    } catch {
      // ignore
    }
  }
  if (!host) {
    // Browsers always send Origin on cross-origin POST. Absence
    // signals either a non-browser client or a CSRF attempt that
    // suppressed both Origin and Referer (uncommon — most browsers
    // refuse to do this). Reject.
    return {
      ok: false,
      status: 403,
      body: { error: 'origin_required' },
    };
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return {
      ok: false,
      status: 403,
      body: { error: 'origin_forbidden' },
    };
  }
  return { ok: true };
}
