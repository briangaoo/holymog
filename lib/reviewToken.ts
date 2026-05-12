import crypto from 'crypto';

/**
 * HMAC-signed token for one-click admin review actions embedded in
 * outbound email. The token authorises a specific (scanId, action)
 * pair for 7 days. Without this, anyone who guessed a scanId could
 * decline arbitrary high-score scans from the email's URL.
 *
 * AUTH_SECRET is the signing key — same secret used for the
 * anonymous-id cookie HMAC and Auth.js session signing, so rotating it
 * invalidates email review links along with everything else, which is
 * the correct blast radius.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `approve` / `decline` are for high-score scan review (anchored on a scanId).
 * `ban` / `dismiss` are for battle reports (anchored on a reportId). The HMAC
 * input is the same `${id}:${action}:${expires}` regardless of action, so the
 * generic signer/verifier handles both surfaces.
 */
export type ReviewAction = 'approve' | 'decline' | 'ban' | 'dismiss';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET not configured');
  return s;
}

function computeHmac(scanId: string, action: ReviewAction, expires: number): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`${scanId}:${action}:${expires}`)
    .digest('base64url');
}

export function signReviewToken(
  scanId: string,
  action: ReviewAction,
): { token: string; expires: number } {
  const expires = Date.now() + TOKEN_TTL_MS;
  return { token: computeHmac(scanId, action, expires), expires };
}

export function verifyReviewToken(args: {
  scanId: string;
  action: ReviewAction;
  expires: number;
  token: string;
}): boolean {
  if (!Number.isFinite(args.expires) || Date.now() > args.expires) return false;
  const expected = computeHmac(args.scanId, args.action, args.expires);
  const a = Buffer.from(args.token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
