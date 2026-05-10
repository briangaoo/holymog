# Pre-Launch Security Hardening Plan

**Status:** Ready to execute (defer until after mog-battles completion + account cleanup + privacy/tos)
**Author:** Audit by Claude (May 9, 2026)
**Goal:** Take the codebase from "open during development" to "production-ready against sophisticated attackers" with defense-in-depth at every layer.

---

## Threat Model

**In scope:**
- Account takeover, impersonation, privilege escalation
- Data exfiltration of other users' profiles, scans, battle history
- Cost attacks: burning Gemini/LiveKit/Supabase budget through abuse
- Leaderboard cheating / score forgery
- Battle manipulation: forging scores, rejoining finished battles, ELO farming
- Storage abuse: filling buckets, hosting malicious payloads, CDN cost
- Resource exhaustion / DoS

**Out of scope (covered elsewhere):**
- Physical security of laptops / .env files
- Dependency-chain attacks (dependabot covers most)
- Nation-state level attacks

**Assumed posture after this plan:**
- API layer: every mutation gated by auth + rate limit + ownership check
- DB layer: RLS enabled on every table; service-role used only for genuinely cross-user operations
- Storage layer: bucket policies enforce per-user write paths, public read only on intentionally-public assets
- Network layer: security headers (CSP, HSTS, X-Frame-Options) on every response
- Cookies: HttpOnly, Secure, SameSite=Lax with explicit Secret rotation procedure

---

## Phase 0: Already Done (May 9, 2026 immediate fixes)

These shipped in the same session as this plan was written:

- `lib/ratelimit.ts` — converted to multi-preset (default, quickScore, battleScore, battleJoin, username, accountMutate)
- `app/api/debug-log/route.ts` — returns 404 in production
- `app/api/quick-score/route.ts` — per-IP rate limit (60/min)
- `app/api/leaderboard/route.ts` GET — page parameter bounded to 1000
- `app/api/leaderboard/battles/route.ts` GET — page parameter bounded to 1000
- `app/api/battle/[id]/token/route.ts` — rejects token requests for finished/abandoned battles
- `app/api/battle/join/route.ts` — rate-limited per (user × IP) at 20/min
- `app/api/battle/score/route.ts` — rate-limited per (user × battle) at 30/min
- `app/api/account/me/route.ts` PATCH — rate-limited per user at 3/hour for username changes
- `lib/scanLimit.ts` — `readClientIp()` validates IP format before trusting

---

## Phase 1: Row-Level Security Migration (CRITICAL)

**Why:** Right now, RLS is disabled on every table. The entire access-control story lives in API routes. If a single API route is wrong, the table is open. If the service-role key leaks, the database is open. Defense-in-depth requires RLS as the second layer.

**Approach:**
- Service-role key continues to be used by API routes (it bypasses RLS, which is fine because the API has already done auth + ownership checks)
- The anon key (used by client-side Supabase calls — which we intentionally minimize) gets restricted to read-only paths
- The `authenticated` Auth.js role is wired so that if we ever add direct-from-client Supabase calls, the user can only touch their own row

**Files to create:**

1. `docs/migrations/2026-XX-XX-rls-enable-and-policies.sql` — see template below
2. `docs/migrations/2026-XX-XX-rls-storage-policies.sql` — Storage bucket policies

**Files to modify:**

- `lib/supabase.ts` — add a `getSupabaseAuthed(userId)` that uses `set_config('request.jwt.claims', ...)` so anon-key reads can pass `auth.uid() = $X` policies
- All API routes that currently use `getSupabase()` for reads of user-scoped data — switch to `getSupabaseAdmin()` if they don't already, OR pass user context

**Migration template:**

```sql
-- Phase 1: Enable RLS on every public table.

alter table profiles            enable row level security;
alter table leaderboard         enable row level security;
alter table battles             enable row level security;
alter table battle_participants enable row level security;
alter table matchmaking_queue   enable row level security;
alter table scan_attempts       enable row level security;

-- profiles: users can read + update their own row only.
-- The display_name + image are exposed publicly via /api/leaderboard joins,
-- so writes are owner-only but the other policies (battle/leaderboard) join
-- profiles via service role.
drop policy if exists profiles_owner_select on profiles;
create policy profiles_owner_select on profiles
  for select using (auth.uid() = user_id);

drop policy if exists profiles_owner_update on profiles;
create policy profiles_owner_update on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No INSERT policy — profile rows are created by the Auth.js createUser hook
-- using the service role.

-- leaderboard: world-readable (it's a public board), owner-only writes.
drop policy if exists leaderboard_world_select on leaderboard;
create policy leaderboard_world_select on leaderboard
  for select using (true);

drop policy if exists leaderboard_owner_write on leaderboard;
create policy leaderboard_owner_write on leaderboard
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- battles: visible to participants only (and the host).
drop policy if exists battles_participant_select on battles;
create policy battles_participant_select on battles
  for select using (
    auth.uid() = host_user_id
    or exists (
      select 1 from battle_participants p
       where p.battle_id = battles.id and p.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — battle creation/state-mutations go
-- through service-role API routes that have already validated the actor.

-- battle_participants: visible to anyone in the same battle.
drop policy if exists battle_participants_peer_select on battle_participants;
create policy battle_participants_peer_select on battle_participants
  for select using (
    exists (
      select 1 from battle_participants p2
       where p2.battle_id = battle_participants.battle_id
         and p2.user_id = auth.uid()
    )
  );

-- matchmaking_queue: server-only. No anon/authenticated access at all.
-- (No policies = deny all when RLS enabled.)

-- scan_attempts: server-only. The user never reads their own attempts
-- directly — they hit /api/scan/check which returns aggregates.

-- Storage bucket policies live in a separate migration because Supabase
-- handles them through its own GUI / SQL flavor.
```

**Storage policies (separate migration):**

```sql
-- Avatar paths: avatars/{user_id}.{ext}
-- Leaderboard photos: random UUIDs at the bucket root.

-- Anyone can read (faces bucket is public for the leaderboard board).
drop policy if exists faces_world_read on storage.objects;
create policy faces_world_read on storage.objects
  for select using (bucket_id = 'holymog-faces');

-- Owners can write to their own avatar slot only.
drop policy if exists faces_avatar_owner_write on storage.objects;
create policy faces_avatar_owner_write on storage.objects
  for insert with check (
    bucket_id = 'holymog-faces'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists faces_avatar_owner_update on storage.objects;
create policy faces_avatar_owner_update on storage.objects
  for update using (
    bucket_id = 'holymog-faces'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists faces_avatar_owner_delete on storage.objects;
create policy faces_avatar_owner_delete on storage.objects
  for delete using (
    bucket_id = 'holymog-faces'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Leaderboard photos go through the API (service-role); no anon/authenticated
-- write policy. Deletes are also service-role-only (we cascade on user delete).
```

**Testing checklist:**

After this migration runs, smoke-test EVERY API route:

- [ ] `/api/account/me` GET — returns own profile + leaderboard row
- [ ] `/api/account/me` PATCH — updates own display_name
- [ ] `/api/account/me` DELETE — cascades cleanly
- [ ] `/api/account/avatar` POST — upload to own slot
- [ ] `/api/account/avatar` DELETE — clear own slot
- [ ] `/api/account/history` — returns own battles
- [ ] `/api/leaderboard` GET — public board still works
- [ ] `/api/leaderboard` POST — own row insert/update
- [ ] `/api/leaderboard/battles` GET — public ELO board still works
- [ ] `/api/score` — anon scan still works (service-role writes scan_attempts)
- [ ] `/api/quick-score` — works for anon
- [ ] `/api/scan/check` — works for anon (cookie issue) and authed
- [ ] `/api/battle/create` POST — host creates battle
- [ ] `/api/battle/join` POST — joiner enters battle
- [ ] `/api/battle/queue` POST/DELETE — anon can queue (no, requires auth) / authed can queue
- [ ] `/api/battle/start` POST — host can start, non-host gets 403
- [ ] `/api/battle/score` POST — participant can score
- [ ] `/api/battle/finish` POST — server-only path
- [ ] `/api/battle/[id]/token` GET — participant gets token
- [ ] `/api/battle/leave` POST — participant leaves
- [ ] `/api/battle/rematch` POST — host can rematch
- [ ] `/api/auth/[...nextauth]` — Auth.js still works

If anything breaks, the API route is doing something the new policy doesn't allow. Fix the route to use `getSupabaseAdmin()` (service-role) for the operation, OR add a more permissive policy if appropriate.

---

## Phase 2: Anti-Cheat for Leaderboard

**Why:** `/api/leaderboard` POST currently accepts user-supplied `scores` and trusts them. A user can submit `{ overall: 99 }` with any photo and top the board.

**Decision required first:**

Three options, in order of cost vs. integrity:

- **A** (cheapest, weak): keep client-supplied scores; require photo for S-tier; manually moderate the board
- **B** (middle): server-side re-score the photo against Gemini before accepting; reject if mismatched > 10 points
- **C** (best): only `/api/score` can populate leaderboard — `/api/leaderboard` POST takes no scores; it just promotes the user's most-recent server-validated `/api/score` result

**Recommended:** C. Implementation:

**Files to modify:**

- `app/api/score/route.ts` — when authenticated, also stash the `scores + vision + capturedImage` into a new `pending_leaderboard_submissions` table (TTL 1 hour). The user can then call `/api/leaderboard` POST with no body to "promote" their pending entry.
- `app/api/leaderboard/route.ts` — POST no longer takes scores or imageBase64. Instead reads pending row, copies into leaderboard, deletes pending.
- `components/LeaderboardModal.tsx` — drop client-side score forwarding; just call POST with empty body.
- New migration: `pending_leaderboard_submissions` table.

```sql
create table pending_leaderboard_submissions (
  user_id     uuid primary key references users(id) on delete cascade,
  scores      jsonb not null,
  vision      jsonb not null,
  image_path  text,
  image_url   text,
  created_at  timestamptz not null default now()
);

create index pending_lb_created_at_idx
  on pending_leaderboard_submissions (created_at);

alter table pending_leaderboard_submissions enable row level security;
-- Only the service role accesses this; no policies needed.
```

**Files to create:**
- `app/api/cron/prune-pending-leaderboard/route.ts` — Vercel Cron job to delete rows >1h old.

**Result:** It is mathematically impossible to put a forged score on the leaderboard. Every entry was scored by Gemini on a real photo within the last hour.

---

## Phase 3: Auth.js Hardening

**Files to modify:**

- `lib/auth.ts`:
  - Verify `cookies` block sets `secure: true` in production, `sameSite: 'lax'`, `httpOnly: true`, optional `domain: '.holymog.com'` once domain is live
  - Add `experimental.cookies.cookiePrefix: '__Host-'` (when behind HTTPS-only domain)
  - Configure `pages` to send custom error/signin URLs
  - Add `events.signIn` / `events.signOut` audit hooks
  - Validate `EMAIL_SERVER_*` and `AUTH_RESEND_KEY` at module load — fail fast if magic-link is half-configured
  - Lock `authorized` callback so that protected routes (`/account`, `/mog`) require a valid session at the middleware layer
- `middleware.ts` (CREATE if not exists) — wrap `auth` middleware to redirect unauth users from protected routes to `/auth/signin?callbackUrl=...`

**Migration / config changes:**

- Rotate `AUTH_SECRET` post-launch. Document the rotation procedure (Vercel env edit + redeploy; sessions invalidate).
- Set `AUTH_TRUST_HOST=true` for Vercel. Already done if cookies are working in prod.

---

## Phase 4: Input Validation Hardening (Schemas)

**Why:** Most routes have ad-hoc `typeof === 'string'` checks. One misalignment and a route accepts undefined/null/objects-where-strings-belong.

**Approach:** introduce `zod` schemas for every API route's body / query / params.

**Files to create:**

- `lib/schemas/account.ts` — `MePatchSchema`, `AvatarPostSchema`, `LeaderboardPostSchema`
- `lib/schemas/battle.ts` — `BattleCreateSchema`, `JoinSchema`, `StartSchema`, `ScoreSchema`, `FinishSchema`, `LeaveSchema`
- `lib/schemas/score.ts` — `ScoreBodySchema`, `QuickScoreBodySchema`
- `lib/parseRequest.ts` — helper: `parseRequest(request, schema)` returns `{ data } | { error: string; status: number }`

**Files to modify:** EVERY API route under `app/api/`. Replace ad-hoc validation with `parseRequest`.

**Bonus:** standardize response schemas too. Every error response should be `{ error: string; message?: string; details?: unknown }`. Inconsistent shapes today (`{ error }` vs `{ error, message }` vs `{ ok: false, error }`).

---

## Phase 5: Storage Hardening

**Files to modify:**

- `app/api/account/avatar/route.ts`:
  - Re-encode uploaded image with `sharp` (already in deps?) to strip EXIF, randomize metadata, normalize to 256×256 PNG. Currently the user's raw upload is stored.
  - Add server-side magic-byte check (don't trust mime claimed in body)
  - Set `cacheControl` to a reasonable value (currently `no-cache` for instant updates is fine)
- `app/api/leaderboard/route.ts`:
  - Same `sharp` re-encode treatment for leaderboard photos
  - Random UUID path is good ✓
  - Cleanup of replaced `image_path` on update is already done ✓
- New helper: `lib/imageUpload.ts` — `safeImageUpload(buffer, mime): Promise<{ blob: Blob; mime: string }>` runs `sharp` re-encode + dimensions check + size check.

**Files to create:**

- `app/api/cron/prune-orphan-images/route.ts` — find storage objects whose paths don't appear in any DB row (avatar_url, image_path) and delete weekly.

---

## Phase 6: Cost / Abuse Controls

**Files to modify:**

- `lib/ratelimit.ts` — add presets:
  - `accountAvatar` (5/h per user) — avatar upload rate
  - `leaderboardSubmit` (5/h per user) — leaderboard submission rate
  - `battleCreate` (10/h per user) — private battle creation rate
- `app/api/account/avatar/route.ts` POST — apply `accountAvatar`
- `app/api/leaderboard/route.ts` POST — apply `leaderboardSubmit`
- `app/api/battle/create/route.ts` POST — apply `battleCreate`
- `app/api/battle/queue/route.ts` POST — apply per-user 30/min (queue churn protection)

**Daily Gemini budget enforcement:**

- New table `daily_cost_log (date, total_input_tokens, total_output_tokens, gemini_calls)` — incremented by `lib/vision.ts` on every call
- Hard ceiling check at start of `/api/score` and `/api/quick-score`: if today's cost > budget cap, reject all calls until UTC midnight
- Surface as a `system_unavailable` error to users; ops alerts via Slack webhook

---

## Phase 7: Information Leakage Cleanup

**Files to modify:**

- `app/api/account/me/route.ts` GET — confirm response only includes fields needed by the UI (already pretty tight)
- `app/api/account/history/route.ts` — opponent rows should only include `display_name` + `peak_score`, NOT `user_id` (right now exposes opponents' user_ids — minor info leak)
- `app/api/leaderboard/route.ts` GET — confirm `name + overall + tier + sub-scores + image_url + avatar_url + created_at` is the full set; specifically NOT user_id
- `app/api/leaderboard/battles/route.ts` GET — same audit; user_id is currently included for joins, should be replaced with display_name only on the public response
- `lib/livekit.ts` — `mintLiveKitToken` puts `avatarUrl` in metadata; that's fine since it's already a public URL

**Generic error message wrapper:**

- `lib/errors.ts` — `function publicError(internal: unknown, fallback: string): { error: string; status: number }` — maps internal errors to safe public messages
- Every catch block in API routes should pass through this. Today many routes return `err.message` directly, which can leak DB schema or Gemini API state.

---

## Phase 8: Realtime / Channel Security

**Files to investigate/modify:**

- `lib/realtime.ts` — read; confirm broadcast channels are battle-scoped (each `battle_id` is its own channel)
- Supabase Dashboard → Realtime config — disable `postgres_changes` broadcasts on tables we don't intentionally subscribe to (battles, battle_participants if they're broadcast). Right now any client with the anon key could subscribe to `postgres_changes` on tables and watch row updates.
- New: `lib/realtime.ts` — only broadcast through server-mediated channels, never via direct Postgres replication

**LiveKit:**

- Confirm `mintLiveKitToken` grants are minimal (subscribe + publish to one specific room only, not `roomCreate` or wildcard) — already correct in the current code
- LiveKit room names should be unguessable (they include `battle_id` UUIDs already — good)

---

## Phase 9: Security Headers + CSP

**Files to create:**

- `next.config.ts` — add a `headers()` function returning:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` (camera + mic needed for /scan and /mog)
  - `Content-Security-Policy` — restrictive policy with explicit allow-lists for:
    - `default-src 'self'`
    - `script-src 'self' 'wasm-unsafe-eval'` (MediaPipe needs wasm)
    - `style-src 'self' 'unsafe-inline'` (Tailwind inline styles via CSS-in-JS)
    - `img-src 'self' data: https://*.supabase.co https://lh3.googleusercontent.com https://*.googleusercontent.com`
    - `media-src 'self' blob:` (camera blob URLs)
    - `connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com wss://*.livekit.cloud wss://*.supabase.co`
    - `frame-src 'none'`
    - `worker-src 'self' blob:` (MediaPipe spawns workers)
- New: `lib/csp-nonces.ts` — if we end up needing inline scripts, use per-request nonces

**Files to modify:**

- `app/layout.tsx` — review meta tags, add `<meta name="referrer" content="strict-origin-when-cross-origin">` if not already
- `middleware.ts` — set per-route headers if needed

---

## Phase 10: Audit Logging + Monitoring

**Files to create:**

- New table:
  ```sql
  create table audit_log (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references users(id) on delete set null,
    action      text not null,
    resource    text,
    metadata    jsonb,
    ip_hash     text,
    user_agent  text,
    created_at  timestamptz not null default now()
  );
  create index audit_log_user_action_idx on audit_log (user_id, action, created_at desc);
  alter table audit_log enable row level security;
  -- service-role only; no policies
  ```
- `lib/audit.ts` — `recordAudit({ userId, action, resource, metadata })` — fire-and-forget insert

**Files to modify:**

Add `recordAudit()` calls at sensitive operations:
- `app/api/account/me/route.ts` DELETE — `account_delete`
- `app/api/account/me/route.ts` PATCH — `username_change`
- `app/api/account/avatar/route.ts` POST — `avatar_upload`
- `app/api/account/avatar/route.ts` DELETE — `avatar_delete`
- `app/api/leaderboard/route.ts` POST — `leaderboard_submit`
- `app/api/battle/create/route.ts` POST — `battle_create`
- `app/api/battle/finish/route.ts` POST — `battle_finish` (with winner + ELO deltas)
- `lib/auth.ts` events.signIn / signOut — `signin` / `signout`

**Monitoring:**

- Wire to Vercel Analytics or Sentry (out of scope for plan, but flag for ops)
- Add `error` log lines for: rate-limit-blocked requests at unusual rates, unauthorized access attempts on protected routes, RLS policy denials (Postgres logs)

---

## Phase 11: Cookies, Sessions, CSRF

**Files to modify:**

- `lib/anonymousId.ts` — already HMAC-signed + HttpOnly. Confirm `secure: true` in prod (already `process.env.NODE_ENV === 'production'`). Consider rotating the signing key (currently `AUTH_SECRET`) on a key-rotation schedule.
- `lib/auth.ts` — verify Auth.js v5 default cookie config is `__Secure-` prefixed in prod
- API routes that mutate state — Auth.js handles CSRF for its own routes via the built-in token; for our custom mutations, the SameSite=Lax cookie is sufficient defense for the threat model. Add explicit `Origin` header check on critical routes:
  - `/api/account/me` DELETE
  - `/api/account/avatar` POST/DELETE
  - `/api/battle/finish` POST
  - **`/api/score`** — defends against competitors using our endpoint as a free Gemini-face-scoring proxy from their backend
  - **`/api/quick-score`** — same: blocks non-holymog origins from hammering the live-meter for free Gemini access
  - **`/api/battle/score`** — same cost-abuse surface for battle scoring
  - **`/api/leaderboard`** POST — prevents off-site forms from posting fake scores
  - **`/api/account/me`** PATCH, **`/api/battle/create`**, **`/api/battle/join`**, **`/api/battle/start`**, **`/api/battle/queue`**, **`/api/battle/leave`**, **`/api/battle/rematch`**, **`/api/account/leaderboard`** DELETE, **`/api/account/reset-stats`** — every authenticated mutation should check Origin
  
  Helper: `lib/originGuard.ts` — `requireSameOrigin(request)` returning 403 if `Origin` (or fallback `Referer`) host doesn't match `process.env.NEXT_PUBLIC_APP_URL` (or an allow-list including `holymog.com`, `holymog.vercel.app`, `localhost:3000` for dev). Browsers always send `Origin` on POST/PUT/DELETE/PATCH; absent header → reject. Scrapers CAN spoof it but most off-the-shelf abuse tools don't, so this raises the bar significantly without breaking real users.

  **Caveat:** Origin check is bypassable by a determined attacker writing a custom backend. The real ceiling on cost abuse is the Phase 6 daily budget cap + kill switches. Origin check is the cheap first line; budget cap is the hard one.

---

## Phase 12: Data Retention + Right to Delete

**Files to create:**

- New cron route `app/api/cron/prune-old-data/route.ts`:
  - Delete `scan_attempts` older than 90 days
  - Delete finished `battles` older than 1 year (and their participants via cascade)
  - Delete abandoned `matchmaking_queue` rows older than 5 minutes (already handled by `pair_two()`, just make it explicit)
  - Delete `pending_leaderboard_submissions` older than 1 hour
  - Delete `audit_log` rows older than 1 year
- `vercel.json` (or `vercel.ts`) — register the cron job to run daily

**GDPR / BIPA compliance:**

- `app/api/account/me/route.ts` DELETE already cascades. Verify Storage cleanup of `image_path` works for all leaderboard photos (currently only catches one per row — what about historical photos that got replaced? They should be cleaned up by the orphan-image cron from Phase 5).
- Add an "export my data" endpoint: `app/api/account/export/route.ts` GET — returns a JSON dump of user's profile + battles + scans + audit log. Required by GDPR Art. 20 (right to data portability).
- Document retention policy in `/privacy` page.

---

## Phase 13: Penetration Testing Prep

**Tasks (no code changes):**

- Document attack surface: list all public endpoints, all auth-required endpoints, all internal endpoints
- Run `npm audit` and resolve any CVEs in dependencies
- Run a static-analysis tool (`eslint-plugin-security`, `semgrep`) over the codebase
- Manual fuzz: send malformed requests to every endpoint, check for 5xx (should be 4xx)
- Set up bug-bounty disclosure: `/.well-known/security.txt` with security contact
- Pre-launch external pentest (consider engaging a firm, even a 1-week spot check)

---

## Phase 14: Incident Response

**Files to create:**

- `docs/runbooks/incident-response.md` — playbook for:
  - Suspected service-role key compromise: rotate immediately via Supabase Dashboard, redeploy
  - Suspected AUTH_SECRET compromise: rotate, force-invalidate all sessions
  - Mass account abuse / botnet: temporarily restrict signup, raise rate limits, ban IPs
  - Gemini quota exhaustion: kill switch via env var that disables /api/score and /api/quick-score
  - Leaderboard cheating outbreak: temporarily disable POST, manually review entries

**Files to modify:**

- `lib/featureFlags.ts` (CREATE) — a few hardcoded env-var-driven kill switches:
  - `KILL_SWITCH_SCORE` — disables `/api/score` and `/api/quick-score`
  - `KILL_SWITCH_BATTLES` — disables battle creation/scoring
  - `KILL_SWITCH_LEADERBOARD` — disables leaderboard writes
  - `KILL_SWITCH_SIGNUPS` — disables new account creation
- All affected routes return 503 with `{ error: 'temporarily_unavailable' }` when their flag is on.

---

## Suggested Execution Order

1. **Phase 1** (RLS) — foundational, run first because it changes how every route reads/writes
2. **Phase 4** (input validation schemas) — better foundation before adding more code
3. **Phase 7** (info leakage) — easy wins, do alongside Phase 4 since both are per-route
4. **Phase 5** (storage) — depends on input-validation refactor
5. **Phase 6** (cost controls) — bolt onto existing rate-limiter
6. **Phase 2** (leaderboard anti-cheat) — biggest UX change; do after security primitives are in place
7. **Phase 3** (Auth.js hardening) — straightforward config changes
8. **Phase 9** (security headers + CSP) — last after no more inline-script risks
9. **Phase 10** (audit logging) — orthogonal, can interleave anywhere after Phase 1
10. **Phase 11** (cookies/CSRF) — small additions
11. **Phase 12** (retention/right-to-delete) — operational, not gating launch
12. **Phase 8** (realtime) — verify only, mostly config
13. **Phase 13** (pentest prep) — pre-launch checklist
14. **Phase 14** (incident response) — pre-launch checklist

**Estimated total effort:** 30–50 hours of focused work, depending on testing rigor.

---

## Validation Gate Before Launch

Don't ship without ALL of these green:

- [ ] Phase 1 RLS migration applied; smoke test all routes pass
- [ ] Phase 4 every API route uses zod schemas; tsc clean
- [ ] Phase 5 avatar + leaderboard photos re-encoded server-side
- [ ] Phase 6 daily Gemini budget cap enforced
- [ ] Phase 9 security headers visible on every response (`curl -I` check)
- [ ] Phase 11 Origin guard on destructive endpoints
- [ ] Phase 12 retention crons scheduled and tested
- [ ] `npm audit` clean
- [ ] External pentest completed (or 1-week internal red-team exercise)
- [ ] Runbooks (Phase 14) committed and the kill-switch env vars work in staging
