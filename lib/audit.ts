import { cookies } from 'next/headers';
import { getPool } from './db';
import {
  IMPERSONATION_COOKIE_NAME,
  isAdminUserId,
  verifyImpersonationCookie,
} from './admin';

/**
 * Append-only audit log for sensitive operations. Hits the
 * `audit_log` table (created in
 * `docs/migrations/2026-05-09-settings-profile-monetization.sql`).
 *
 * Best-effort: errors are swallowed. Audit failures must NEVER block
 * the calling request — if Postgres is down, we'd rather complete the
 * user's action than 500 them.
 *
 * Typical call sites:
 *   - account_delete / account_create
 *   - username_change
 *   - avatar_upload / avatar_delete / banner_upload / banner_delete
 *   - leaderboard_submit / leaderboard_remove
 *   - battle_create / battle_finish (winner + ELO deltas)
 *   - subscription_started / subscription_canceled
 *   - signin / signout
 *
 * Forensic queries against this table are how we reconstruct what
 * happened during an incident. Don't include passwords / tokens /
 * secrets in metadata; those go nowhere ever.
 */

export type AuditEvent = {
  /** Acting user. null for system-initiated events (cron, webhook). */
  userId: string | null;
  /** Snake_case verb. Short, stable, queryable. */
  action: string;
  /** Optional ID of the resource acted on (battle_id, leaderboard row, etc). */
  resource?: string | null;
  /** Optional structured context. Avoid PII; this is logged + retained. */
  metadata?: Record<string, unknown>;
  /** Optional IP hash (already-hashed via lib/scanLimit's hashIp). */
  ipHash?: string | null;
  /** Optional user-agent string (truncated to 256 chars by caller). */
  userAgent?: string | null;
};

export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    // Impersonation tracking: when an admin is acting as another user,
    // the calling code passes the TARGET's user_id (because session.user.id
    // has been swapped). To preserve the trail back to the real operator,
    // we re-read the impersonation cookie here and merge the admin's id
    // into the metadata. We only do this when the verified cookie's
    // admin_id is on the allowlist — a stray cookie from a former admin
    // (env-var removed) shouldn't taint future audit records.
    //
    // cookies() is only available inside a request scope (route handlers,
    // server components). In contexts where it's not — e.g. cron jobs,
    // webhooks — the try/catch around the whole block silently treats
    // the audit as non-impersonated, which is correct.
    let metadata = event.metadata ?? {};
    try {
      const cookieStore = await cookies();
      const impCookie = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
      if (impCookie) {
        const verified = verifyImpersonationCookie(impCookie);
        if (verified && isAdminUserId(verified.adminUserId)) {
          metadata = {
            ...metadata,
            impersonated: true,
            impersonator_user_id: verified.adminUserId,
          };
        }
      }
    } catch {
      // no cookie context (cron, webhook, edge) — just skip the
      // impersonation merge and audit normally.
    }

    const pool = getPool();
    await pool.query(
      `insert into audit_log
         (user_id, action, resource, metadata, ip_hash, user_agent)
         values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        event.userId,
        event.action,
        event.resource ?? null,
        JSON.stringify(metadata),
        event.ipHash ?? null,
        event.userAgent?.slice(0, 256) ?? null,
      ],
    );
  } catch {
    // best-effort — audit failures must never block the calling
    // request. Swallow; the application keeps working.
  }
}
