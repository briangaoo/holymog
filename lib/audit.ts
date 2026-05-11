import { getPool } from './db';

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
    const pool = getPool();
    await pool.query(
      `insert into audit_log
         (user_id, action, resource, metadata, ip_hash, user_agent)
         values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        event.userId,
        event.action,
        event.resource ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.ipHash ?? null,
        event.userAgent?.slice(0, 256) ?? null,
      ],
    );
  } catch {
    // best-effort — audit failures must never block the calling
    // request. Swallow; the application keeps working.
  }
}
