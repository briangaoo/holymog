# Settings + Public Profiles + Monetization Overhaul

> **Status:** ready to execute. Phase 1 ships in this same session; Phases 2-11 land in follow-up turns.
> **Goal:** Take the settings page from skeletal to feature-complete, add public profile pages anyone can view, wire up the engagement/notification loop, and stand up the monetization plumbing (Stripe Checkout for profile flair, badges, themes, frames). Multiplies engagement: every place where one user's name appears, it links to their profile, which surfaces their flair, which makes the storefront aspirational.

**Decisions locked at planning time (2026-05-09):**
- Stripe Checkout for purchases (real money, day one).
- Resend for both transactional + digest email (single vendor).
- Public profile URL: `/account/[username]`. `/account` (no slug) remains the signed-in user's settings.
- Username changes are rate-limited (3/hour, already shipped). Old usernames are tracked in `profiles.previous_usernames text[]` so renames don't break inbound links — `/account/[old-name]` redirects to current.

---

## Phase ordering and dependencies

```
1. Database foundation ─────┬── 2. Public profile pages ──┬── 4. Cross-page profile links
                            │                              │
                            ├── 3. Settings rewrite ───────┤
                            ├── 5. Stats enhancements ─────┤
                            ├── 7. Security & account ─────┤
                            ├── 8. Data export ────────────┤
                            └── 9. Profile customization ──┴── 10. Stripe storefront
                                                                
6. Email infra (independent) ─── runs in parallel
11. Help & legal (independent) ── lands last
```

Execution order: 1 → 2/3/5 → 4/6/7/8 → 9 → 10 → 11.

---

## Phase 1: Database foundation (this session)

**Goal:** every later phase depends on schema changes — get them in early.

**Migration:** `docs/migrations/2026-05-09-settings-profile-monetization.sql`

Touches `profiles`:
- `bio text` (nullable, max 240 chars enforced at API layer)
- `socials jsonb default '{}'::jsonb` — keys: `instagram`, `x`, `snapchat`, `tiktok`, `discord`
- `hide_photo_from_leaderboard boolean default false`
- `hide_elo boolean default false`
- `mute_battle_sfx boolean default false`
- `weekly_digest boolean default true`
- `mog_email_alerts boolean default false`
- `equipped_flair text` — slug from `catalog_items`
- `equipped_theme text`
- `equipped_frame text`
- `two_factor_secret text` — encrypted at rest (TOTP secret)
- `two_factor_enabled boolean default false`
- `previous_usernames text[] default array[]::text[]` — last 10 retained on rename

New tables:
- `catalog_items (id uuid pk, kind text, slug text unique, name text, description text, price_cents int, image_url text, animation_data jsonb, sort_order int, active boolean default true, created_at timestamptz)` — items the storefront sells
- `user_inventory (id uuid pk, user_id uuid fk, item_slug text, source text check ('purchase','grant','reward'), purchased_at timestamptz, stripe_payment_intent text)` — what each user owns
- `stripe_purchases (id uuid pk, user_id uuid fk, stripe_session_id text unique, stripe_payment_intent text, amount_cents int, status text, items_jsonb jsonb, created_at timestamptz)` — payment ledger
- `elo_history (id uuid pk, user_id uuid fk, elo int, recorded_at timestamptz default now())` — sparkline data, written on every battle finish
- `scan_history (id uuid pk, user_id uuid fk, overall int, jawline int, eyes int, skin int, cheekbones int, presentation int, vision jsonb, created_at timestamptz default now())` — per-scan data for most-improved metric and aggregate stats
- `email_preferences (user_id uuid pk fk, weekly_digest boolean default true, mog_alerts boolean default false, battle_invites boolean default true, last_digest_sent_at timestamptz)` — separated from profiles so the cron can `UPDATE` last_digest_sent_at without touching profile fields. (Some fields duplicate profiles.* — they're the source of truth here; profiles columns are legacy mirrors that the next API write will sync.)
- `audit_log (id uuid pk, user_id uuid fk on delete set null, action text, resource text, metadata jsonb, ip_hash text, user_agent text, created_at timestamptz)` — sensitive ops logging (referenced in Phase 7 too)

Indexes:
- `elo_history_user_id_recorded_at_idx` (user_id, recorded_at desc)
- `scan_history_user_id_created_at_idx` (user_id, created_at desc)
- `user_inventory_user_id_idx` (user_id)
- `catalog_items_kind_active_idx` (kind, active, sort_order)
- `audit_log_user_action_idx` (user_id, action, created_at desc)

**`lib/reservedUsernames.ts`** — denylist of usernames colliding with routes or unsavory:

```
account login signup auth api admin mog scan leaderboard battle terms
privacy help support team about settings profile shop store
holymog www mail email admin root null undefined
```

`isReservedUsername(name): boolean` returns true for any match (case-insensitive). Wired into `/api/account/me` PATCH validation alongside the existing regex.

**Files modified:**
- `app/api/account/me/route.ts` PATCH — call `isReservedUsername`, return `username_reserved` 409 if true. Also append old name to `previous_usernames` (max 10) before update.

**Apply:** SQL gets pasted into Supabase Dashboard SQL Editor by the user.

---

## Phase 2: Public profile pages

**Goal:** Anyone can navigate to `/account/[username]` to see another user's profile.

**Files to create:**
- `app/account/[username]/page.tsx` — server component. Resolves username → user_id (current name OR previous_usernames hit, redirect if old). Renders public profile via `<PublicProfileView>`.
- `app/account/[username]/not-found.tsx` — 404 page.
- `components/PublicProfileView.tsx` — read-only profile display. Renders avatar (respects `hide_photo_from_leaderboard`), display name, bio, equipped flair/frame around avatar, equipped theme as page bg accent, socials row (links out to insta/x/snap/etc), stats panel (ELO unless `hide_elo`, W/L, win rate, peak ELO, best scan, account age, total scans, current streak, longest streak), recent battles (last 5).
- `app/api/profile/[username]/route.ts` — GET endpoint. Returns the full public-profile JSON shape used by the page component. Fetches profile + recent battles + total scans aggregate. Strips email and other private fields.

**Files modified:**
- `app/account/page.tsx` — header now shows a "view public profile" link to `/account/[your-username]` next to the avatar (so you can preview what others see).

**Privacy controls applied:** `hide_photo` swaps avatar for letter-circle. `hide_elo` returns `null` for elo / peak / win-rate fields and the panel hides those rows. Profile bio + socials always show if set (they're explicit opt-ins).

**SEO:** `generateMetadata` in `[username]/page.tsx` returns the public name + tier as page title (`<username> · S+ on holymog`). Future: `next/og` for share images per profile.

---

## Phase 3: Settings rewrite (sectioned)

**Goal:** turn the bare 3-card settings tab into a proper Linear/Stripe-style settings page with named sections.

**Files modified:**
- `components/AccountSettingsTab.tsx` — rewritten as section list. Each section is a self-contained sub-component reading/writing one slice of `/api/account/me`.

**New section components** (all in `components/account/settings/`):
- `ProfileSection.tsx` — avatar + display name + bio textarea (240 chars) + socials row (5 inputs, `instagram`, `x`, `snapchat`, `tiktok`, `discord`)
- `PrivacySection.tsx` — `hide_photo_from_leaderboard`, `hide_elo`. Each toggle persists immediately on change (debounced 500ms).
- `BattleSection.tsx` — `mute_battle_sfx`, future placeholder for reduced motion / haptics.
- `NotificationsSection.tsx` — `weekly_digest`, `mog_email_alerts` (defaults: digest on, alerts off so we don't spam new users). Plus a "send me a test digest" button for verification.
- `AccountSection.tsx` — change email button (opens modal), connected accounts list, active sessions list, 2FA setup button.
- `CustomizationSection.tsx` — currently equipped flair/theme/frame with thumbnails. "Browse store →" link to `/account/store`. "Equipped" badge on each, click row → equip picker.
- `DataSection.tsx` — "download my data (mog.json)" button. Plus the existing Danger Zone: reset stats, remove leaderboard, delete account.
- `HelpSection.tsx` — links to `/help`, `/terms`, `/privacy`. Footer text: `holymog v{NEXT_PUBLIC_APP_VERSION}` (env-driven). "Report a bug" link to `mailto:hello@holymog.com?subject=bug` for now.

**Layout:** vertical scroll list of sections, each with the existing `Section`+`Row` primitives. Sticky-top section nav on desktop (`md:block hidden` sidebar with anchor links). On mobile, plain scroll.

**Files modified (server-side):**
- `app/api/account/me/route.ts` PATCH — accept all new profile fields (`bio`, `socials`, `hide_photo_from_leaderboard`, `hide_elo`, `mute_battle_sfx`, `weekly_digest`, `mog_email_alerts`). Validate per-field. Sync `email_preferences` from the relevant flags.

---

## Phase 4: Cross-page profile links

**Goal:** every place a user's name appears, it's a link to `/account/[username]`. This is the engagement multiplier — flair gets seen everywhere.

**Files modified:**
- `app/leaderboard/page.tsx` — scan rows: name → `/account/[username]`. Battle rows: same.
- `components/AccountHistoryTab.tsx` — opponent names → `/account/[username]`.
- `app/mog/BattleRoom.tsx` — `AvatarPill` wraps in `<Link href="/account/[username]">` (only when not `hasLeft`). Tap-target accessible.
- `app/mog/page.tsx` — `Lobby` participant rows: name → profile.
- `app/mog/battle/page.tsx` — `FinishedScreen` `ResultCell`: name → profile (both you and opponent).
- `components/LeaderboardModal.tsx` — opponent name in comparison block (when shown) → profile.
- `components/AccountAvatar.tsx` — header avatar links to `/account/[username]` for the public view (currently goes to `/account` which is settings).

**Note:** for the header avatar link to work, we need a `/account` page that recognizes when there's no slug (= owner) vs a slug (= public view). The simplest split: `/account` = settings (current), `/account/[username]` = public. Header avatar → `/account/[currentUsername]`.

---

## Phase 5: Stats enhancements

**Goal:** the AccountStatsTab and the public profile both surface richer stats.

**Files modified:**
- `app/api/account/me/route.ts` GET — add aggregates: `total_scans` (count of scan_history), `account_age_days` (now - created_at), `highest_overall_ever` (max(overall) across scan_history + best_scan_overall). Plus `elo_sparkline` (last 30 elo_history entries as `[ {elo, recorded_at} ]`). Plus `most_improved_metric` (compute from scan_history: which sub-score has the largest delta from oldest 5-scan window to newest 5-scan window).
- `app/api/battle/finish/route.ts` — write a row to `elo_history` for each participant after ELO updates land.
- `app/api/score/route.ts` — write a row to `scan_history` after `combineScores` (only for authenticated users).
- `components/AccountStatsTab.tsx` — new sections:
  - **Account age + lifetime** — `joined N days ago · X scans · Y battles`
  - **ELO over time** — small SVG sparkline (no chart lib; ~50 lines of inline SVG)
  - **Highest ever** — `best scan: 92 · highest tier: S+ · peak ELO: 1480`
  - **Most improved** — `your eyes score is up 8 points over your last 10 scans 🎯`

**Files to create:**
- `components/Sparkline.tsx` — pure SVG sparkline component, takes `points: number[]`, renders a path with optional dot at end.

---

## Phase 6: Email infrastructure (independent of phases above)

**Goal:** wire up Resend for transactional + digest, add the cron job.

**Files to create:**
- `lib/email.ts` — Resend client wrapper. `sendEmail({ to, subject, react: ReactElement })`. Single function, used by all email callers.
- `lib/email-templates/WeeklyDigest.tsx` — React Email template: stats this week (battles played, win rate delta, ELO delta, best scan), top moment (biggest ELO gain or highest scan), CTAs back to /scan and /mog.
- `lib/email-templates/YouGotMogged.tsx` — short alert with mogging user + new top score.
- `lib/email-templates/BestScanBeaten.tsx` — your high score on the leaderboard was beaten by user X.
- `app/api/cron/weekly-digest/route.ts` — Vercel Cron runs Sunday 12:00 UTC. Queries users where `weekly_digest = true` and `last_digest_sent_at < now() - interval '6 days'`, sends digest, updates `last_digest_sent_at`.
- `app/api/cron/leaderboard-displaced/route.ts` — runs hourly. Detects when a leaderboard top-N user gets bumped, sends `BestScanBeaten` email if `mog_email_alerts = true`.

**Files to modify:**
- `vercel.json` (CREATE if missing) — register the two cron jobs:
  ```json
  {
    "crons": [
      { "path": "/api/cron/weekly-digest", "schedule": "0 12 * * 0" },
      { "path": "/api/cron/leaderboard-displaced", "schedule": "0 * * * *" }
    ]
  }
  ```
- `package.json` — add `react-email`, `@react-email/components`, `@react-email/render` (for templating).

**Auth on cron routes:** Vercel adds `Authorization: Bearer ${CRON_SECRET}` automatically. Routes verify and 401 otherwise. Locked.

**Resend setup:** existing `AUTH_RESEND_KEY` reused. Sender domain: same as auth (`auth@holymog.com`). Optional split later (`team@` for marketing) — flag in plan but defer.

---

## Phase 7: Security & account management

**Files to create:**
- `app/api/account/sessions/route.ts` GET (list user's auth.js sessions), DELETE (kick all except current).
- `app/api/account/sessions/[id]/route.ts` DELETE — kick a specific session.
- `app/api/account/email/route.ts` PATCH — change email. Sends verification link to NEW email + alert to OLD email. Email update happens only after the new-email link is clicked.
- `app/api/account/2fa/setup/route.ts` POST — generates TOTP secret, returns provisioning URI for QR code.
- `app/api/account/2fa/verify/route.ts` POST — accepts TOTP code, sets `two_factor_enabled = true` if valid.
- `app/api/account/2fa/disable/route.ts` POST — requires current TOTP code, disables 2FA.
- `app/api/account/connected-accounts/route.ts` GET — list rows from `accounts` table for current user.
- `app/api/account/connected-accounts/[provider]/route.ts` DELETE — unlink a provider (refuses if it's the only auth method).

**Files to create:**
- `lib/totp.ts` — TOTP wrapper (using `otplib`). Encrypt/decrypt secret with AES-256 from `AUTH_SECRET`.

**Files to modify:**
- `lib/auth.ts` — add `signIn` callback that requires 2FA verification step if `profiles.two_factor_enabled = true`. New `/auth/2fa-challenge` page asks for code mid-signin.

**Auth.js sessions integration:** the `sessions` table already exists. Just expose it via the new endpoints.

**`package.json` add:** `otplib`, `qrcode` (server-side QR generation for the setup page).

---

## Phase 8: Data export (GDPR Art. 20)

**Files to create:**
- `app/api/account/download/route.ts` GET — returns JSON dump:
  ```json
  {
    "exported_at": "2026-05-09T12:34:56Z",
    "profile": { /* full profile */ },
    "email_preferences": { /* prefs */ },
    "scans": [ /* full scan_history */ ],
    "battles": [ /* battle_participants joined to battles, only mine */ ],
    "elo_history": [ /* full elo_history */ ],
    "leaderboard_entry": { /* if any */ },
    "audit_log": [ /* user's own audit entries */ ],
    "purchases": [ /* stripe_purchases */ ],
    "inventory": [ /* user_inventory */ ]
  }
  ```
- Content-Disposition: `attachment; filename="holymog-mog.json"`. Streams from PG in chunks if large.

**Files modified:**
- `components/account/settings/DataSection.tsx` — "download my data" button posts to the route, downloads.

---

## Phase 9: Profile customization

**Goal:** the *display* layer for purchased flair, themes, frames. Items aren't purchasable yet (Phase 10) but the inventory system + equip/unequip is fully functional via admin grants.

**Files to create:**
- `app/account/store/page.tsx` — storefront. Tabs: badges, themes, frames. Each item card shows preview + "owned" / price button. Click → item detail modal.
- `components/CustomizationPreview.tsx` — renders an avatar with a given `frame_slug` + `theme_slug` applied. Used in store cards, settings, and on profile pages.
- `lib/customization.ts` — registry mapping `slug → renderConfig`. Each frame is JSX (animated SVG ring, conic-gradient, etc.) — registered in code so they're typesafe and styleable.
- `app/api/account/equip/route.ts` POST — body `{ kind, slug }`. Validates ownership in `user_inventory`, sets `profiles.equipped_*`.
- `app/api/account/unequip/route.ts` POST — body `{ kind }`. Clears the relevant `equipped_*` field.
- `app/api/admin/grant/route.ts` POST — admin-only (env-gated `ADMIN_USER_IDS`), grants an item to a user. Used for early-access founders, contest prizes, refunds. Inserts `user_inventory` row with `source = 'grant'`.

**Catalog seeding:**
- `docs/migrations/2026-05-09-catalog-seed.sql` — INSERTs 10-20 starter items: a few free badges (founding member, beta tester), a few priced frames (5-10 USD), a couple of priced themes (10-20 USD).

**Files modified:**
- `components/PublicProfileView.tsx` — applies equipped customization.
- `components/AccountAvatar.tsx` — applies equipped frame.
- `app/mog/BattleRoom.tsx` — `AvatarPill` applies equipped frame for visible flair during battles.
- `app/leaderboard/page.tsx` — leaderboard rows show frame around avatars.

**Animated frames:** CSS-driven (conic-gradient + animation). No video, no canvas — just SVG/CSS for performance. Inspired by Discord profile decorations.

---

## Phase 10: Stripe Checkout

**Files to create:**
- `lib/stripe.ts` — Stripe client (server-only).
- `app/api/checkout/create-session/route.ts` POST — body `{ items: [slug] }`. Creates Stripe Checkout Session, returns `url` + `session_id`.
- `app/api/webhooks/stripe/route.ts` POST — handles `checkout.session.completed`. Verifies signature with `STRIPE_WEBHOOK_SECRET`. On success: insert `stripe_purchases` row, insert `user_inventory` rows for each item, log to audit.
- `app/account/store/success/page.tsx` — landing after Checkout. Shows "thanks for your purchase, here's what you got" + equip CTAs.
- `app/account/store/cancel/page.tsx` — landing if user bails on Checkout.

**Files to modify:**
- `app/account/store/page.tsx` — "Buy" button now calls `create-session` and redirects to Stripe.
- `package.json` — add `stripe`.

**Env additions:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Webhook verification:** standard Stripe pattern, raw body required → use Next's route handlers with `request.text()` and `stripe.webhooks.constructEvent()`.

**Money flow:**
1. User clicks Buy → POST /create-session
2. Server creates session with line items pulled from `catalog_items`
3. User redirected to Stripe-hosted checkout
4. On success Stripe → `/api/webhooks/stripe` fires
5. Webhook adds inventory rows + logs purchase
6. User lands on `/account/store/success` and sees their new items

---

## Phase 11: Help & legal

**Files to create:**
- `app/help/page.tsx` — FAQ + contact form (sends via Resend to `hello@holymog.com`).
- `app/api/contact/route.ts` POST — accepts contact form, rate-limited (5/h per IP), sends to inbox.

**Files modified:**
- `app/terms/page.tsx`, `app/privacy/page.tsx` — add "last updated" timestamp + biometric/data-retention sections (cross-reference with the security plan from earlier).
- Footer link from settings to `/help`.

---

## Cross-cutting work (sprinkled across phases)

- **Audit log usage** — every Phase 7 sensitive op + Phase 9 admin grant + Phase 10 purchase fires `recordAudit()`. Hooked from the security-hardening plan.
- **Reserved usernames** in storefront URLs — `store`, `success`, `cancel` etc are reserved at the route level, no DB enforcement needed (different namespace from `/account/[username]`).
- **Privacy gating** on /api/profile/[username] — respects `hide_photo`, `hide_elo`. Doesn't return email, internal IDs, raw scores beyond what `combineScores` produces, audit, or sessions.

---

## Test plan (per phase)

Each phase ends with a smoke test:
- **Phase 1:** Run migration. `select * from profiles limit 1` shows new columns.
- **Phase 2:** Visit `/account/[your-username]` → renders profile. Visit `/account/nonexistent` → 404. Toggle `hide_photo` in DB manually → photo hides.
- **Phase 3:** Each section toggle persists. Reload → state matches.
- **Phase 4:** Click any name in leaderboard / battle / history → lands on profile.
- **Phase 5:** Stats tab shows account age, sparkline renders. After a fresh battle, ELO history grows.
- **Phase 6:** Trigger digest cron with `?force=true` query param (dev only) → email lands.
- **Phase 7:** Set up 2FA in settings → next sign-in prompts for code. Active sessions list shows current device. Kick remote → that browser's session breaks.
- **Phase 8:** Click download → `.mog.json` lands with all expected sections.
- **Phase 9:** Admin-grant an item via `/api/admin/grant`. Equip it. Profile + leaderboard show frame.
- **Phase 10:** Buy an item via Stripe (test mode). Inventory row appears. Equip it. Done.
- **Phase 11:** /help renders. Contact form delivers email.

---

## Risk register

- **Stripe webhook idempotency:** Stripe retries on failure. Use `stripe_session_id` UNIQUE constraint to prevent double-grant.
- **2FA recovery:** locked-out user can't get back in if they lose their authenticator. Mitigation: include 8 backup codes in setup (write to `profiles.two_factor_backup_codes text[]` encrypted, single-use). Add to Phase 7 spec.
- **Email deliverability:** Resend default is good but watch bounce rates. If digests get marked spam, split sender domain (deferred decision).
- **`/account/[username]` collisions:** reserved-username check is the gate. If a username slips through (e.g., legacy data), the route resolution finds the user; Next can't reach `/account/store/page.tsx` because that's a literal path. Defense-in-depth: don't allow usernames matching exact route segments at signup.
- **Scope creep:** 11 phases is a lot. Each phase is independently shippable — DO NOT roll all into one PR.
