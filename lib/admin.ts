import crypto from 'crypto';
import { auth } from './auth';

/**
 * Admin gate. Returns the caller's user id if they're an admin, null
 * otherwise.
 *
 * Auth model: caller must (a) be signed in, AND (b) have a user id
 * listed in the comma-separated ADMIN_USER_IDS env var. We deliberately
 * use a single shared env-var allowlist instead of a DB flag — keeps
 * the admin identity outside of any table that can be written by the
 * app, so a SQL injection or compromised service-role key can't
 * elevate to admin.
 *
 * Every admin surface — both the /admin page and /api/admin/*
 * endpoints — funnels through this helper. When it returns null, the
 * caller MUST respond with a real 404 (via `notFound()` from
 * 'next/navigation'), NOT a 401 / 403. The page existence is
 * deliberately undetectable — anyone hitting /admin or /api/admin/*
 * without admin credentials should get the same response as if those
 * routes didn't exist at all.
 *
 * Returns: { userId } when admin, null otherwise. The shape leaves
 * room to add more context later (per-admin permissions, etc.) without
 * touching every call site.
 */
export async function requireAdmin(): Promise<{ userId: string } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!adminIds.includes(userId)) return null;
  return { userId };
}

/**
 * Synchronous variant for clients that already have a session in hand
 * (e.g. inside an event handler that called auth() up the call stack).
 * Mostly here to keep callsites tidy when they already have the user
 * id — same allowlist check, no DB / network. Returns boolean.
 */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

// ---- Impersonation -------------------------------------------------------
//
// Admins can "view as" any user. We do this with a separate signed
// cookie alongside the existing Auth.js session, NOT by swapping the
// underlying session token. The flow:
//
//   1. Admin POSTs /api/admin/impersonate/start with a target user_id.
//   2. We mint a short-lived HMAC-signed cookie containing
//      `admin_id.target_id.issued.expires`.
//   3. lib/auth.ts session() callback reads this cookie and — only if
//      the actual logged-in user is still on the admin allowlist —
//      swaps session.user.id to the target. session.user._impersonator_id
//      preserves the admin's real id so downstream code (audit log,
//      banner, etc) can show who's really driving.
//   4. lib/audit.ts reads the same cookie and tags every recorded
//      action with metadata.impersonator_user_id, so the trail back
//      to the admin is forensically intact.
//
// Why a separate cookie and not a session swap:
//   - The admin doesn't lose their own session, so /admin still works
//     while impersonating elsewhere in another tab if needed.
//   - The Auth.js sessions table stays clean of "fake" session rows.
//   - Cookie expiry is short (1h) and self-contained — no DB cleanup
//     needed when an admin walks away.
//   - HMAC means a compromised admin id can't be turned into perpetual
//     impersonation; the cookie must always be reissued by the server.

export const IMPERSONATION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-hm-imp'
    : 'hm-imp';

export const IMPERSONATION_TTL_SEC = 60 * 60; // 1 hour

type ImpersonationPayload = {
  adminUserId: string;
  targetUserId: string;
};

function hmacHex(payload: string): string {
  const secret = process.env.AUTH_SECRET ?? '';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Mint a signed impersonation cookie value. AUTH_SECRET must be
 * configured — if it's missing we throw rather than mint an
 * unsigned cookie that the verify path would silently reject. The
 * cookie format is `admin_id.target_id.issued.expires.hmac`. All
 * four payload fields are bound to the signature, so a tampered
 * cookie can't survive verification.
 */
export function signImpersonationCookie(payload: ImpersonationPayload): string {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is required to mint impersonation cookies');
  }
  const issued = Math.floor(Date.now() / 1000);
  const expires = issued + IMPERSONATION_TTL_SEC;
  const body = `${payload.adminUserId}.${payload.targetUserId}.${issued}.${expires}`;
  const sig = hmacHex(body);
  return `${body}.${sig}`;
}

/**
 * Verify and parse an impersonation cookie value. Returns null on
 * any failure: missing secret, malformed format, bad signature,
 * expired. Uses crypto.timingSafeEqual to defeat signature-leak
 * timing attacks.
 */
export function verifyImpersonationCookie(
  value: string | null | undefined,
): ImpersonationPayload | null {
  if (!value) return null;
  if (!process.env.AUTH_SECRET) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [adminUserId, targetUserId, issuedStr, expiresStr, sig] = parts;
  if (!adminUserId || !targetUserId) return null;
  const body = `${adminUserId}.${targetUserId}.${issuedStr}.${expiresStr}`;
  const expected = hmacHex(body);
  // Both buffers must be the same length for timingSafeEqual.
  if (sig.length !== expected.length) return null;
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires)) return null;
  if (expires < Math.floor(Date.now() / 1000)) return null;
  return { adminUserId, targetUserId };
}
