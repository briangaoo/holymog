/**
 * Kill switches for emergency response. Each flag is read at request
 * time from an env var; flipping it requires only a Vercel env-var
 * edit + redeploy, no code change. See
 * docs/runbooks/incident-response.md for the playbook.
 *
 * Affected endpoints return 503 `system_unavailable` when the flag
 * is on, with no descriptive body so external probes can't fingerprint
 * which kill switch is engaged.
 */

const ON_VALUES = new Set(['1', 'true', 'yes', 'on']);

function flag(name: string): boolean {
  const value = process.env[name];
  return value != null && ON_VALUES.has(value.toLowerCase());
}

/** Disables /api/score and /api/quick-score. Use when Gemini quota
 *  exhausted or a cost spike fires the budget alarm. */
export function isScoreKilled(): boolean {
  return flag('KILL_SWITCH_SCORE');
}

/** Disables /api/battle/create, /api/battle/join, /api/battle/queue,
 *  /api/battle/score, /api/battle/finish. Use for matchmaking abuse,
 *  LiveKit / Realtime outage routing, or runaway Gemini cost from
 *  battle scoring. */
export function isBattlesKilled(): boolean {
  return flag('KILL_SWITCH_BATTLES');
}

/** Disables /api/leaderboard POST. Use during a leaderboard-cheat
 *  investigation when we want to halt new entries without taking the
 *  read path offline. */
export function isLeaderboardKilled(): boolean {
  return flag('KILL_SWITCH_LEADERBOARD');
}

/** Disables new Auth.js sign-ups (new user creation). Existing
 *  sessions keep working. Use for a sign-up wave / bot attack. */
export function isSignupsKilled(): boolean {
  return flag('KILL_SWITCH_SIGNUPS');
}
