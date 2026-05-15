import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import {
  IMPERSONATION_COOKIE_NAME,
  isAdminUserId,
  verifyImpersonationCookie,
} from '@/lib/admin';
import { ImpersonationExitButton } from './ImpersonationExitButton';

/**
 * Server-rendered sticky banner that shows whenever the current
 * request is operating under admin impersonation. Mounted once in
 * app/layout.tsx so it appears on every page automatically — admin
 * never has to remember "am I still acting as X?"
 *
 * The banner is the visual contract of impersonation: as long as the
 * banner is on screen, every click happens as the target user. Exit
 * is a single button that POSTs to /api/admin/impersonate/stop and
 * reloads. The route handler clears the cookie; the reload re-runs
 * this layout and the banner disappears.
 *
 * Renders nothing when no valid impersonation cookie is present
 * (vast majority of requests). The DB lookup for the target's
 * display name is skipped in that case, so there's no overhead on
 * regular page loads.
 */
export async function ImpersonationBanner() {
  let payload;
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    payload = verifyImpersonationCookie(value);
  } catch {
    return null;
  }
  if (!payload) return null;

  // Defense in depth: the auth() session swap also requires the admin
  // id to still be on the allowlist. We re-check here so a stale
  // banner can never display after the admin has been demoted via
  // env-var change.
  if (!isAdminUserId(payload.adminUserId)) return null;

  // Fetch target display_name for the banner copy. Best-effort —
  // a DB hiccup falls back to showing the raw user_id, which is
  // ugly but functional.
  let targetLabel = payload.targetUserId.slice(0, 8) + '…';
  try {
    const pool = getPool();
    const r = await pool.query<{ display_name: string }>(
      'select display_name from profiles where user_id = $1 limit 1',
      [payload.targetUserId],
    );
    if (r.rows[0]?.display_name) {
      targetLabel = `@${r.rows[0].display_name}`;
    }
  } catch {
    // ignore
  }

  return (
    <div
      className="sticky top-0 z-[200] flex items-center justify-between gap-3 border-b-2 border-rose-500 bg-rose-500/[0.12] px-4 py-2 backdrop-blur"
      style={{ textTransform: 'none' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center border border-rose-400 bg-rose-500/30 text-[10px] font-bold text-rose-200"
          style={{ borderRadius: 2 }}
        >
          !
        </span>
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-rose-200">
          ADMIN — ACTING AS{' '}
          <span className="text-white">{targetLabel}</span>
          <span className="ml-2 hidden text-rose-300/70 sm:inline">
            · every action below is performed as this user
          </span>
        </span>
      </div>
      <ImpersonationExitButton />
    </div>
  );
}
