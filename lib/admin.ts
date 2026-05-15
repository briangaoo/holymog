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
