# Incident Response Playbook

Quick-reference for things going wrong. Each section: signal → action.

## Kill switches

Each is a Vercel env var. Flip to `1`, redeploy, traffic stops to the affected
endpoint with a 503 `system_unavailable`. No code change required.

| Env var | What it disables | Use when |
|---|---|---|
| `KILL_SWITCH_SCORE` | `/api/score`, `/api/quick-score` | Gemini quota exhausted, cost spike, or scoring-side abuse |
| `KILL_SWITCH_BATTLES` | `/api/battle/score`, `/api/battle/create`, `/api/battle/join`, `/api/battle/queue`, `/api/battle/finish` | Matchmaking abuse, LiveKit outage, runaway battle-scoring cost |
| `KILL_SWITCH_LEADERBOARD` | `/api/leaderboard` POST | Leaderboard-cheat investigation — halts new entries, read path stays up |
| `KILL_SWITCH_SIGNUPS` | new Auth.js user creation | Sign-up wave / bot attack |

Values that evaluate as on: `1`, `true`, `yes`, `on` (case-insensitive). Anything
else is off.

## Common incidents

### Suspected service-role key compromise

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase Dashboard → Settings → API.
2. Update the Vercel env var with the new value.
3. Redeploy. Old key is dead within ~30s.
4. Audit `audit_log` for any rows in the past 24h that don't trace to a
   legitimate API operation (Phase 10).
5. Notify users via email if any data was likely accessed.

### Suspected `AUTH_SECRET` compromise

1. Rotate `AUTH_SECRET` (generate 32 fresh bytes: `openssl rand -base64 32`).
2. Update Vercel env, redeploy.
3. **Every existing session is now invalid** — users will be signed out.
   This also invalidates the HMAC on anonymous-ID cookies and email-change
   tokens, both of which derive from `AUTH_SECRET`.
4. Issue a security advisory if any tokens were likely captured.

### Mass account abuse / botnet sign-ups

1. Flip `KILL_SWITCH_SIGNUPS=1`.
2. In `lib/ratelimit.ts`, lower the `accountMutate` window to 5/min and
   redeploy.
3. Identify the abusive IP block from Vercel logs + Upstash analytics.
4. Add an explicit `accept-ips` allowlist or `deny-ips` blocklist in middleware
   if the block is identifiable.
5. After the wave passes, unflip `KILL_SWITCH_SIGNUPS` and restore rate limits.

### Gemini quota exhaustion

1. Flip `KILL_SWITCH_SCORE=1` and `KILL_SWITCH_BATTLES=1`.
2. Investigate the cost-attribution — Google AI Studio dashboard shows usage
   per key. If a single user is responsible, suspend their account.
3. Bump the Google AI Studio billing limit if legitimate organic traffic
   genuinely outgrew the cap.
4. Unflip the kill switches.

### Leaderboard cheating outbreak

1. Flip `KILL_SWITCH_LEADERBOARD=1`. New entries stop landing.
2. Query `leaderboard` rows submitted in the past 24h. Cross-check against
   `scan_history` to confirm each entry has a corresponding server-scored
   scan within ~1 hour. (Once Phase 2 anti-cheat is live, every entry
   MUST have a corresponding `pending_leaderboard_submissions` row that
   was promoted — discrepancies indicate a bug, not cheating.)
3. Delete fraudulent rows directly via Supabase Studio.
4. Unflip the kill switch.

### LiveKit / Realtime outage

1. Flip `KILL_SWITCH_BATTLES=1` to stop new battles being created.
2. In-progress battles will fail soft — `/api/battle/finish` still works
   without realtime broadcasts; clients fall back to polling state.
3. Wait for LiveKit/Supabase status pages to clear.
4. Unflip the kill switch.

## CSP tightening (future)

Production CSP currently allows `'unsafe-inline'` on `script-src` for Next's
hydration scripts. The real fix is per-request nonces via middleware:

- Generate a nonce in `middleware.ts` (random 16+ bytes, base64url).
- Inject into the `Content-Security-Policy` header for that response.
- Add `<Script nonce={nonce}>` wrappers around inline scripts in
  `app/layout.tsx`.
- Replace `'unsafe-inline'` with `'nonce-{value}'` and `'strict-dynamic'`
  in `next.config.ts`'s `CSP_PRODUCTION`.

Not blocking for launch — defense-in-depth via Origin guard + SameSite=Lax
cookies + Auth.js session cookies covers the realistic CSRF/XSS surface.

## Reaching us

- **Security disclosures**: `security@holymog.com` (forward to `hello@`
  until a dedicated inbox exists)
- **DMCA**: `dmca@holymog.com`
- **Abuse / safety**: `safety@holymog.com`
