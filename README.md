# holymog

AI-powered face rating. F- to S+. Scan yourself, battle a stranger 1v1 on camera, or queue a private 10-person party with a 6-character code. Built on Next.js 16 (App Router) + React 19 + Auth.js v5 + Supabase Postgres + LiveKit + Google Vertex AI (Gemini 2.5 Flash Lite).

This README documents every file in the repo (excluding `node_modules`, `.next`, `.vercel`, `.env*`, `.DS_Store`, `*.tsbuildinfo`, `next-env.d.ts`, and the local `.claude/` agent state — see `.gitignore`).

---

## Table of contents

1. [The two game modes](#the-two-game-modes)
2. [Stack](#stack)
3. [Top-level layout](#top-level-layout)
4. [Scoring pipeline](#scoring-pipeline)
5. [Tier ladder](#tier-ladder)
6. [ELO model](#elo-model)
7. [Authentication](#authentication)
8. [Privacy, biometric consent, retention](#privacy-biometric-consent-retention)
9. [Storage buckets](#storage-buckets)
10. [Realtime](#realtime)
11. [Rate limiting, budget cap, kill switches, audit](#rate-limiting-budget-cap-kill-switches-audit)
12. [Security headers + CSP](#security-headers--csp)
13. [Cosmetics + achievements](#cosmetics--achievements)
14. [Subscription (holymog+)](#subscription-holymog)
15. [Cron jobs](#cron-jobs)
16. [Routes and pages (`app/`)](#routes-and-pages-app)
17. [API routes (`app/api/`)](#api-routes-appapi)
18. [Library modules (`lib/`)](#library-modules-lib)
19. [Hooks (`hooks/`)](#hooks-hooks)
20. [Components (`components/`)](#components-components)
21. [Cosmetic components](#cosmetic-components)
22. [Account settings sections](#account-settings-sections)
23. [Public assets (`public/`)](#public-assets-public)
24. [Configuration files](#configuration-files)
25. [Scripts](#scripts)
26. [Environment variables](#environment-variables)
27. [Local development](#local-development)
28. [Deployment](#deployment)
29. [Database wipe + reset](#database-wipe--reset)
30. [Notable conventions and "watch-outs"](#notable-conventions-and-watch-outs)

---

## The two game modes

### scan (`/scan`)

Single-photo aesthetic rating. The flow:

1. **Privacy gate** — first-visit modal requires an affirmative-consent checkbox (BIPA / GDPR Art. 9) before the camera detects anything.
2. **Camera mounts** with `facingMode: 'user'` at portrait 720×1280 or landscape 1280×720, depending on viewport. Mirrored preview (`scaleX(-1)`).
3. **Face detection** — MediaPipe `FaceLandmarker` (478-point mesh) running every other animation frame. Requires 3 stable frames in a row to lock on. Multiple faces in the frame block detection.
4. **3-second countdown** — large numeric digits (3→2→1) with a spring overshoot per swap.
5. **5-second scan phase** — the live meter and spiderweb overlay appear:
   - **Live meter** (top-left): 5 real calls to `/api/quick-score` (Gemini 2.5 Flash Lite, ~70-token prompt → `{ overall }`) at 1-second intervals, interleaved with 5 synthetic ±1/±2 jitter updates anchored on the last real score so the readout feels alive without spamming Gemini. Total 10 visible updates.
   - **Spiderweb overlay** (`components/SpiderwebOverlay.tsx`): SVG line-drawing of MediaPipe landmark groups (face outline, eyes, brows, nose, lips, jaw, IPD-normalized cross-pairs with measurement labels) animated over 5 seconds.
   - 2 captured frames are saved at `t=4.5s` and `t=6.5s` for the heavy call.
6. **Heavy scoring** — at `t=8s` the captured frames hit `/api/score`, which fans out to Gemini 3× per frame in parallel: **structure**, **features**, **surface** category prompts (`lib/vision.ts`). Sub-scores averaged across frames; one "fallback" flag if any category failed.
7. **Reveal** — count-up animation on the overall number, tier letter pops with a spring, sub-score cards animate their progress bars.
8. **Complete view** — share button (full-width white pill), retake/home/account row, "add to leaderboard" pill, "view leaderboard" link, expandable "more detail" panel showing every Gemini sub-field plus token + cost telemetry (signed-in only).

**Scan limits** (`lib/scanLimit.ts`):
- **Anonymous**: 1 lifetime scan. Tracked via an HMAC-signed `hm_aid` cookie (`lib/anonymousId.ts`), backed by a row in `scan_attempts` with the same `anon_id`. The HMAC prevents cookie tampering — the signing key is `AUTH_SECRET` and verification is timing-safe.
- **Signed in**: 30 scans / rolling 24-hour window. The window is rolling (not midnight-reset), so once a scan you did 24 hours ago expires from the quota window, the slot opens back up.
- **Per-IP daily cap of 3 for anonymous**: defence against cookie-clearing as a circumvention. Same window-based logic; IP hashed (SHA-256 + AUTH_SECRET) before storage so the raw IP is never persisted.
- **Subscribers bypass entirely** (`isSubscriber(userId)` short-circuits with `allowed: true, limit: -1`).
- **Atomic check + insert under `pg_advisory_xact_lock`** so concurrent attempts can't race. The lock key is `hashtext('scan_attempt:user:' || $userId)` for authed users, similar for anon/IP keys. Lock acquisition order is stable (auth path locks one key; anon path locks anon-key before ip-key) so concurrent attempts can't deadlock against each other.
- **Quota slot rolled back if the Vertex call itself fails** (`rollbackScanAttempt`). The attempt row is committed up front so concurrent requests in the same window see the consumed slot and reject; if the downstream Gemini call fails (rate limit, budget cap, vision_unavailable), we delete the row so the user keeps their quota point. Failure of the rollback DELETE itself logs and moves on — quota will simply count this attempt against the user, which is harmless.
- **Pre-cap warning** (`AUTH_DAILY_WARNING_THRESHOLD = 25`): signed-in users see a one-time-per-session toast banner once their daily count crosses 25 — gives them a heads-up before they hit the cap. Dismissal persists in `sessionStorage` so the banner doesn't re-appear every navigation within the same session.

### mog battles (`/mog`, `/mog/battle`)

Live 1v1 (or up to 10) on-camera face-off via LiveKit Cloud SFU. No audio published (face-rating, not a Zoom call — and "under-13 voice exposure + harassment surface" is explicitly out of scope).

Two flavors:

- **Public** (`/mog/battle`): full-screen split-screen route. Hit "find a battle" → enter `matchmaking_queue` → server-side Postgres function `pair_two()` atomically pairs the two oldest waiters into a fresh `battles` row. Client polls `/api/battle/queue/status` every 1.5s until matched (RLS blocks the Realtime subscribe path because Auth.js doesn't set `auth.uid()`).
- **Private** (`/mog`): host clicks "create party" → server generates a Crockford-base32 6-char code (alphabet drops `I/L/O/U`, ~10⁹ keyspace) → host shares the code, guests enter it via a Kahoot-style cell input (auto-advance, paste-distribute, sanitization). Up to **10** participants for free hosts, **20** for `holymog+` subscribers.

Battle lifecycle:
- `lobby` → `starting` (host clicks start, `started_at = now() + 3s`) → `active` (10-second scan window) → `finished`.
- Pre-roll: 3-2-1 countdown with red→amber→emerald digits and per-tick SFX (`lib/battleSfx.ts`, Web Audio synth — no audio files shipped).
- Active phase: each client fires `/api/battle/score` 10× over 11s (first call pre-fires 2s before `started_at` to mask Vertex latency). Each call hits the `analyzeBattle` prompt (`{ overall, improvement }`), updates `battle_participants.peak_score` with `greatest()`, bumps `profiles.improvement_counts[label]`, broadcasts `score.update` over Supabase Realtime.
- Tile layout: adaptive flex grid per (participant count × portrait/landscape) — see `participantRowLayout` in `app/mog/BattleRoom.tsx`. Hairline sky-blue dividers on seams, no gaps. Liquid-glass score card (SVG `feDisplacementMap` refraction) anchored top-left of each tile.
- Finish: whichever client crosses `started_at + 10s` first calls `/api/battle/finish`. Idempotent — sorts participants by peak score desc, joined_at asc; first row wins. Public 1v1 fires the ELO update. Ties (top two peak scores match) get `computeEloTie` (no margin multiplier, both `+matches_tied`). Battle.finished event broadcasts to all clients.
- Reconnection: `lib/activeBattle.ts` persists `{ battle_id, code?, isHost, ts }` to localStorage with a 15-minute window. Reload during a battle → mint a fresh LiveKit token, resync `started_at`, drop back in.

Result screen (`components/MogResultScreen.tsx`) — same component for both flavors. Animated headline (`YOU MOGGED` / `GOT MOGGED` / `TIED`), count-up score cards with tier-coloured borders, margin descriptor (`utter mog` / `clear win` / `comfortable` / `photo finish` / `dead even`), ELO delta pill, share image generator (`generateBattleShareImage` → 1080×1920 PNG), rematch (private) or find-another (public), home button. **Public battles** also show a small `report @opponent` outline button below the action row — opens `BattleReportModal` (see [Reports + bans](#reports--bans) below).

### Battle consent gate

First-time battlers — public or private — see `BattleConsentModal` before any matchmaking starts. The modal explains live-video relay to opponents, peak-frame archiving to the private `holymog-battles` bucket, the post-match report flow on public 1v1, and the ban policy. Affirmative-consent checkbox required, persisted to `localStorage` at `holymog-battle-consent-accepted`. Pattern mirrors the `/scan` privacy gate.

Gating:
- `/mog`: modal pops on first create-party / join-party / find-a-battle click (the action replays after acknowledgement).
- `/mog/battle`: modal opens on landing (the page IS the queue action; camera and matchmaking are blocked until acknowledgement).

### Reports + bans

After every public 1v1, either participant can file a report against the other via `POST /api/battle/report`. The flow:

1. **Server validation** — both participants must have actually been in the battle, the battle must be `kind = 'public'` and in `finished` / `abandoned` state, and the reporter can't be the reportee. Dedupe via `UNIQUE (battle_id, reporter_user_id, reported_user_id)` — re-submitting against the same opponent for the same battle is a silent no-op.
2. **Reasons** — closed enum: `cheating` (deepfake / AI face / celebrity), `minor` (under-18 visible on camera), `nudity`, `harassment`, `spam`, `other`. `other` requires a non-empty `details` string. Free-text `details` is optional for every reason and capped at 1000 chars.
3. **Admin email** — `battleReportEmail` (in `lib/email-templates.ts`) fires to `ADMIN_REVIEW_EMAIL`. The email contains the reason, the reporter + reported display names + user IDs, the battle ID, the optional details, **and a 7-day signed URL to the reported player's peak frame from the `holymog-battles` private bucket** (or a note that no peak frame was on file). Plus one-click action links: `Ban & resolve` and `Dismiss`.
4. **One-click actions** — both URLs land on `/admin/review/report/[reportId]/[action]?token=…&expires=…`. The token is HMAC-signed against `AUTH_SECRET` (`lib/reviewToken.ts`) over `(reportId, action, expires)` with a 7-day TTL.
5. **`Ban` action** — sets `profiles.banned_at = now()` + `banned_reason = report.reason`, **deletes every session** for that user, marks the report `state = 'banned'`, audit-logs `user_banned`, and emails the banned user (`banNoticeEmail`) at the address on file. The Auth.js `signIn` callback (`lib/auth.ts`) blocks any future sign-in attempt while `banned_at` is set.
6. **`Dismiss` action** — marks the report `state = 'dismissed'` and audit-logs. **No user impact, no notification to anyone.**

Privacy posture:
- The reported player is **never notified** that a report was filed or dismissed — only when an operator clicks `Ban`, in which case they receive a single notice email.
- The reporter is **never notified** of the outcome. The submit confirmation is generic: "report submitted. you won't hear back unless we take action."
- Peak frames are saved for **both public and private battles** (one image per signed-in participant per battle, written when their score beats their existing peak — see `app/api/battle/score/route.ts`). The in-app report surface is public-only, but evidence may be needed for manually-routed private complaints sent to `hello@holymog.com`.
- Appeals route via `safety@holymog.com`.

---

## Stack

- **Framework**: Next.js 16.2.4 (App Router) on React 19.2.4. TypeScript 5, ES2017 target, strict mode.
- **Auth**: Auth.js v5 (beta.31) with `@auth/pg-adapter`. Google OAuth + Apple OAuth + email magic link via Nodemailer (Gmail Workspace SMTP).
- **Database**: Supabase managed Postgres via the `pg` driver (connection-pooler at port 6543; `max: 5`, 10s idle timeout). Migrations live in `../docs/migrations/` (sibling to the repo, not committed).
- **Storage**: Three Supabase buckets — `holymog-uploads` (public: avatars, banners, leaderboard photos), `holymog-scans` (private: every signed-in scan, signed-URL access), `holymog-cosmetics` (reserved for Launch 2 designer cosmetics).
- **Realtime**: Supabase Realtime HTTP broadcast API (`/realtime/v1/api/broadcast`) for battle events. Client subscribes via `@supabase/supabase-js` browser channel.
- **Video**: LiveKit Cloud (Selective Forwarding Unit). Server mints 30-minute access tokens via `livekit-server-sdk`; client uses `@livekit/components-react` for the room UI. Video published, audio explicitly disabled.
- **AI**: Google Vertex AI Express-mode (API-key auth) → Gemini 2.5 Flash Lite. Pinned to `us-central1` (the global endpoint added ~10s latency). Three prompt categories per scan frame (structure, features, surface); single-shot prompts for the live meter and battle scoring.
- **Image pipeline**: `sharp` (libvips) re-encode strips every EXIF/GPS/ICC byte, normalizes the raster, clamps the longer edge per kind (avatar 512, banner 2400, leaderboard 1024). Quality-85 mozjpeg / level-9 PNG.
- **Payments**: Stripe (subscriptions + one-time cosmetics). API version `2025-01-27.acacia`. Subscription state mirrored into `profiles.subscription_*` via webhook. Launch 1 ships with the store deferred — `/account/store/*` redirects back to `/account`.
- **Rate limiting + budget**: Upstash Redis (`@upstash/ratelimit` sliding-window) for per-endpoint named presets; Upstash counter for the daily Gemini USD spend cap.
- **Face detection**: `@mediapipe/tasks-vision` `FaceLandmarker` (478-point mesh) running in `VIDEO` mode at 30fps with a 2-frame skip. WASM + GPU delegate from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision`.
- **Styling**: Tailwind v4 (PostCSS). Body globally `lowercase`. Three fonts loaded via `next/font/google`: Space Grotesk (sans), DM Sans (display), IBM Plex Mono (numeric). Custom CSS tokens override `--color-black` / `--color-white` to `#0a0a0a` / `#f5f5f5` (softer than pure OLED black).
- **Motion**: `framer-motion` 12.38.0. `canvas-confetti` for the win-tier confetti burst.
- **Validation**: `zod` v4 for every state-mutating request body.
- **2FA**: HOTP/TOTP implemented in-house in `lib/totp.ts` (no external dep). Secrets AES-256-GCM-encrypted at rest with a key derived from `AUTH_SECRET`.
- **Email**: Gmail Workspace SMTP via `nodemailer`. Daily ~75% cap (1200/day) watched by a cron that alerts when sustained — swap path to Resend documented in `app/api/cron/email-volume-check/route.ts`.

---

## Top-level layout

```
holymog/
├── app/                     # Next.js App Router routes
│   ├── (public pages)       # /, /scan, /mog, /mog/battle, /leaderboard, /help, /privacy, /terms, /share/[platform]
│   ├── account/             # /account (tabs: stats/history/settings), /@[username], followers/following, deferred store
│   ├── admin/review/        # one-click admin approve/decline for high-score scans
│   ├── api/                 # 70+ API routes (see catalog below)
│   ├── globals.css          # Tailwind + name-fx keyframes + tier descriptors
│   └── layout.tsx           # root layout, fonts, metadata, Providers
├── components/
│   ├── (page-level)         # AppHeader, Camera, Starfield, LiveMeter, SpiderwebOverlay, etc.
│   ├── account/settings/    # ProfileSection, PrivacySection, CustomizationSection, etc.
│   ├── cosmetics/           # ShaderCanvas, name-fx/*, glsl/* (noise/palette/sdf)
│   └── customization/       # Badge, Frame, NameFx, ThemeAmbient renderers
├── hooks/                   # 8 client hooks
├── lib/                     # 40+ library modules: vision, auth, db, elo, customization, livekit, …
│   └── schemas/             # Zod request-body schemas (account, battle, score, common)
├── public/                  # logo, og.png, social platform icons, inbox provider thumbs
├── scripts/                 # wipe-supabase.mjs — drop-and-recreate the entire database in one transaction
├── types/                   # FinalScores, VisionScore, Landmark, FlowState/FlowAction, next-auth augmentations
├── .env.example             # template — every var listed below
├── next.config.ts           # security headers, CSP, /@username rewrites
├── vercel.json              # 5 cron jobs (UTC schedule)
├── tsconfig.json
├── postcss.config.mjs
├── package.json
└── README.md                # this file
```

---

## Scoring pipeline

Three distinct entry points into Google Vertex AI's Gemini 2.5 Flash Lite, each with a different cost/latency posture: the **live meter** (cheap, real-time, ~5 calls per scan), the **heavy scan breakdown** (3 category prompts × N frames in parallel, the authoritative 30-field result), and the **battle scoring** (single-shot per-frame, returns `{ overall, improvement }`, fires 10× per battle per user).

All three call into `lib/vision.ts:callGemini()` against the regional Vertex endpoint at `https://us-central1-aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent` with API-key auth. **Why us-central1 over the global endpoint**: measured ~1s per call vs ~11s on the global endpoint — Google's global LB adds ~10s of pure server-side latency on Express-mode requests. The region pinning happens inside `VERTEX_API_BASE`; override per-deploy via `VERTEX_REGION` env var.

### Inputs

- **Live (quick)** call: a single face-cropped JPEG, ~768px longer-edge cap (Gemini's single-tile threshold — anything under `768×768` costs the same 258 input tokens, so we get maximum preserved detail at no incremental cost). ~75-token prompt. `detail: 'low'` semantic on the call options (currently a no-op for Vertex but preserved for source-call compatibility with the prior Grok client).
- **Heavy** call: 1-6 frames, same crop spec, three category prompts per frame fanned out in parallel:
  - **Structure** (9 fields): `jawline_definition`, `chin_definition`, `cheekbone_prominence`, `nose_shape`, `nose_proportion`, `forehead_proportion`, `temple_hollow`, `ear_shape`, `facial_thirds_visual`
  - **Features** (10 fields): `eye_size`, `eye_shape`, `eye_bags`, `canthal_tilt`, `iris_appeal`, `brow_shape`, `brow_thickness`, `lip_shape`, `lip_proportion`, `philtrum`
  - **Surface** (11 fields): `skin_clarity`, `skin_evenness`, `skin_tone`, `hair_quality`, `hair_styling`, `posture`, `confidence`, `masculinity_femininity`, `symmetry`, `feature_harmony`, `overall_attractiveness`
  - Multi-frame averaging: `analyzeFaces(blobs)` runs `analyzeFace(blob)` in parallel per frame and averages every field across frames. Any single category fall-through (`callCategory` retries with `STRICT_PREFIX` once, then neutrals at 50) sets `vision.fallback = true` on the final payload, which the UI reads to render "N/A" gray instead of treating the placeholders as real scores.
- **Battle scoring** call: a single face-cropped JPEG, same crop spec, single prompt that returns `{ overall, improvement }` where `improvement` is one of 11 lowercase labels (`jawline` / `cheekbones` / `chin` / `nose` / `forehead` / `symmetry` / `eyes` / `brows` / `lips` / `skin` / `hair`). Stored in `profiles.improvement_counts` jsonb for the "weakness frequency" stat and surfaced on the battle tile's "FLAW: x" overlay. Labels outside the enum are coerced to `'eyes'` as a neutral fallback.

### Anchor rubric

The shared rubric (`ANCHOR_RUBRIC` in `lib/vision.ts`) calibrates Gemini against a rank-of-1000-random-adults scale: rank-1 → 99-100, rank-2-15 → 95-99 (working-pro model), …, rank-901-995 → 5-25 (severely flawed bone structure).

Critical anti-patterns the rubric encodes:
- **Surface fields cannot pull a structurally failed face above rank 901**. Clear skin on top of a gaunt/recessive/uncanny structure is still grotesque; `overall_attractiveness` anchors on bone structure first.
- **Editorial pose recognition** — slight orbital squint (NOT closed eyes), pursed/inwardly-sucked lips, hollowed cheeks, neutral/cold stare, mild jaw clench, slight chin-down tilt are the *working-pro pose* and score HIGHER (+3-8 across several fields).
- **Smiling explicitly does not raise scores** — it relaxes the jaw, fills the cheeks, and masks bone structure that determines top-tier rank.
- **Deliberate distortion** (recessive jaw, tongue out, eyes squeezed fully shut, hair pulled over face, head turned > 25°) → 5-25 across every field.
- **Lighting / partial occlusion is not a flaw** — score 60-70 instead of low for features you can't see well.

### Score combination

`lib/scoreEngine.ts:combineScores`:

```
jawline      = avg(jawline_definition, chin_definition, lip_shape)
eyes         = avg(eye_size, eye_shape, eye_bags, canthal_tilt, iris_appeal, brow_shape, brow_thickness)
skin         = avg(skin_clarity, skin_evenness, skin_tone)
cheekbones   = avg(cheekbone_prominence, nose_shape, nose_proportion, forehead_proportion,
                   temple_hollow, ear_shape, philtrum, facial_thirds_visual)
presentation = avg(hair_quality, hair_styling, posture, confidence, masculinity_femininity,
                   symmetry, feature_harmony, overall_attractiveness, lip_proportion)

subOverall   = 0.25*jawline + 0.20*eyes + 0.20*skin + 0.15*cheekbones + 0.20*presentation
finalOverall = 0.40*subOverall + 0.60*overall_attractiveness

# anchor clamp for rank-901+ band
if vision.overall_attractiveness ≤ 15: finalOverall = vision.overall_attractiveness
```

The 60/40 weighting toward Gemini's holistic call prevents per-region averages from pulling a structurally elite face down toward the band of its weakest feature.

### Battle scoring

`analyzeBattle` (in `lib/vision.ts`) returns `{ overall, improvement }` — one of 11 lowercase weakness labels (`jawline`, `cheekbones`, `chin`, `nose`, `forehead`, `symmetry`, `eyes`, `brows`, `lips`, `skin`, `hair`). Stored in `profiles.improvement_counts` jsonb and surfaced on the result screen ("FLAW: chin") and on the stats tab's "weakness frequency" chart.

---

## Tier ladder

`lib/tier.ts` — 18 bands across 0-100, deliberately granular to give the user something to chase between adjacent letter grades. The full table:

| Range | Letters | Color band | Descriptor |
|---|---|---|---|
| 0-25 | F-, F, F+ | red `#ef4444` | "ugly af" / "subhuman" / "chopped" |
| 26-40 | D-, D, D+ | orange `#f97316` | "low-tier normie" |
| 41-55 | C-, C, C+ | yellow `#eab308` | "normie" |
| 56-70 | B-, B, B+ | lime `#84cc16` | "high-tier normie" |
| 71-86 | A-, A, A+ | green `#22c55e` | "chadlite" / "chadlite" / "mogger" |
| 87-100 | S-, S, S+ | cyan→violet gradient (`#22d3ee → #a855f7`) | "chad" / "heartbreaker" / **"true adam"** |

The S band is a **gradient** (`isGradient: true` in the tier row) rather than a single color so it visibly differentiates from the green A band — both green and rich green-cyan would feel like the same family otherwise. S+ also sets `glow: true` which adds a `drop-shadow(0 0 36px rgba(34,211,238,0.45))` filter so the letter literally glows.

**Within each band**, `lib/scoreColor.ts:getScoreColor(value)` interpolates HSL so a 71 reads slightly different from an 86 even though both are tier A — the hue/saturation/lightness shift smoothly across the band. The S band ramps from cyan-sapphire (87) to a slightly deeper, more saturated, slightly purpler sapphire at 100, so S+ reads heavier than S-.

**`PHOTO_REQUIRED_THRESHOLD = 87`** is the line that triggers admin high-score review (`requires_review` flag set on `scan_history`, email fires from `/api/score`). Scores below 87 are auto-accepted to the leaderboard with no review. The threshold matches the S band: any "I'm S-tier or above" submission gets human eyes on it (anti-cheat verification only — review never blocks placement). The threshold is exported so it can be raised/lowered without code changes scattered across the codebase.

**Descriptor copy** matters for the brand voice. `getTierDescriptor()` is the single source of truth — every tier-mention render site (scan complete view, leaderboard rows, profile, more-detail panel) calls into the same map. Changing "true adam" to anything else only touches one file.

---

## ELO model

`lib/elo.ts` — standard ELO rating math applied to **public 1v1 only**. Private parties never touch ELO so friends-of-friends can't farm rating; the spec is explicit about anti-farming as the reason.

The lifecycle of a rating update:

1. **Initial rating** — every new account starts at `1000` in `profiles.elo`. `peak_elo` mirrors `elo` until the first win bumps it higher.
2. **Provisional period** — the K-factor (the maximum points a single match can move) is `32` for the first `PROVISIONAL_MATCHES = 30` games, then drops to `16`. New players reach their true rating fast; settled players don't bounce around on a single result.
3. **Expected score** — `expected(ratingA, ratingB) = 1 / (1 + 10^((ratingB - ratingA) / 400))`. Standard ELO math: a 200-point favourite has a ~76% expected win, a 400-point favourite ~91%.
4. **Margin multiplier** — K is scaled by the peak-score delta (`winnerPeak - loserPeak`, in 0..100). Two-piece formula in `marginMultiplier()`:
   - **Log component**: `min(0.5, ln(margin + 1) / 8)`. A margin-100 blowout caps at +50% bonus before damping; a margin-30 win sits around +42%.
   - **Autocorrelation damping**: `2 / (max(0, eloDiff) * 0.001 + 2)`. At `eloDiff = 0` the factor is `1.0` (full bonus); at `eloDiff = 400` it's `0.83`; at `eloDiff = 1000` it's `0.67`. **Underdog wins (`eloDiff < 0`) get the full bonus** — upsets are real signal. The point of the damping is to stop favourites from farming rating by repeatedly destroying weak opponents (the classic rich-get-richer failure mode of margin-aware ELO).
   - **Final multiplier**: `1 + logComponent * autocorrection`, hard-capped at `MAX_MARGIN_MULTIPLIER = 1.5`. Applied symmetrically to both winner's K and loser's K so the system stays close to zero-sum.
5. **Tie path (`computeEloTie`)** — when the top two peak scores match, no one wins. Both players' actual score = 0.5, the rating gap drifts naturally toward equilibrium (equal-rated players get 0 change), `matches_tied` increments on both profiles, **and streaks survive a tie** (a draw is not a loss). No margin multiplier — there's no peak-score delta worth amplifying.
6. **History writes** — every rating update inserts two rows in `elo_history` (`user_id`, `elo`, `delta`, `battle_id`). The sparkline on `/account` and `/@username` reads the most recent 30 in chronological order. The biggest-swings widget on `/account` queries `min(delta)` / `max(delta)`.

**Posture:**
- Public-only rating prevents rating manipulation through friends-of-friends private matches. `lib/elo.ts` is never called from `/api/battle/finish` when `battles.kind = 'private'`.
- Margin multiplier capped at 1.5× keeps a single match from feeling chaotic — even a perfect 92 vs 0 blowout is readable, not a 10-point ELO bath.
- Rating floor at 0 (never negative) is a UX choice, not a math one — `Math.max(0, ...)` clamps the loser delta. Practically irrelevant for anyone who's played even a few rated games.
- `hide_elo` privacy toggle excludes the user from the public ELO leaderboard entirely (showing them at a known rank would leak the value through bounding ranks) and nulls `elo` / `peak_elo` on their public profile. The user still sees their own ELO in `/account` → stats.
- ELO is **final and non-reversible** per the Terms (§9). A bad-faith opponent's match still counts; the only remedy is a report → ban which doesn't unwind the rating change.

---

## Authentication

`lib/auth.ts` — Auth.js v5 (NextAuth) with the `@auth/pg-adapter`, database session strategy (no JWT). Provider list is dynamically built based on which env vars are configured:

- **Google OAuth** — activates when `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` are set. `allowDangerousEmailAccountLinking: true` (Google always returns `email_verified=true`, so the "dangerous" path is safe with Google specifically).
- **Apple OAuth** — same; `AUTH_APPLE_SECRET` is a JWT from a `.p8` key that rotates every 6 months.
- **Email magic link** — Nodemailer transport against Gmail Workspace SMTP. Default `auth@holymog.com` (a free alias of `hello@holymog.com`) authenticated with a 16-char Google app password. Custom `sendVerificationRequest` renders the template from `lib/auth-email.ts` and increments the daily email counter (`recordEmailSent`).

Client gate: `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` / `NEXT_PUBLIC_AUTH_APPLE_ENABLED` show greyed-out "soon" buttons until both halves (client flag + server cred) are set. The UI is dynamic — flipping the env flag activates the OAuth button immediately, no code change.

Cookie scoping: in production with `AUTH_COOKIE_DOMAIN` set (e.g. `.holymog.com`) the session cookie is host-scoped to the parent domain so future subdomains share the session. In dev (no `AUTH_COOKIE_DOMAIN`) Auth.js falls back to host-scoped localhost cookies.

The sign-in lifecycle, end-to-end:

1. **Modal opens** — `components/AuthModal.tsx` mounts via React portal (so it isn't clipped by the AppHeader's `backdrop-blur`). The contextual subtitle ("sign in to battle" / "to scan" / etc.) is passed by the caller. Body lists every configured provider plus a magic-link entry.
2. **OAuth path** — `signIn('google' | 'apple', { callbackUrl })` redirects to the provider's consent screen. On callback, Auth.js's pg adapter handles the code exchange + token storage. `allowDangerousEmailAccountLinking: true` means a returning user whose email matches an existing account auto-links — safe with Google specifically (Google always sets `email_verified=true`); same posture for Apple.
3. **Magic-link path** — `signIn('nodemailer', { email, redirect: false })` triggers our custom `sendVerificationRequest` hook, which renders `lib/auth-email.ts`'s template and posts through Gmail Workspace SMTP. The user pastes the link from their inbox; Auth.js verifies the token, creates the session, redirects to `callbackUrl`. `lib/auth.ts`'s `EMAIL_PROVIDER_ID = 'nodemailer'` is the canonical provider id.
4. **Ban gate** — `callbacks.signIn` reads `profiles.banned_at` and returns `false` for any user whose ban flag is set, redirecting them back to `/` with an error. First-ever sign-in (account-creation path) doesn't have a `profiles` row yet — we return `true` so the adapter can finish the insert; subsequent sign-ins see the row. Fails open on Postgres hiccup so a DB blip can't lock every user out.
5. **`createUser` event** — `events.createUser` upserts a `profiles` row with `derived display_name = lowercase(name || email-local-part).slice(0, 24)`; collisions are not enforced (multiple accounts can share a display name; uniqueness only matters at `display_name` change time via `/api/account/me PATCH`). Audit-logs `account_create`.
6. **`session` callback** — injects `user.id` into `session.user` so client code can read `session.user.id` without an extra DB round-trip. Typed via `types/next-auth.d.ts` so TypeScript sees `id` as required on `Session['user']`.
7. **Sign-out** — `events.signOut` audit-logs. The session row is deleted by Auth.js's adapter.

**Posture:**
- Auth.js uses **database session strategy** (`sessions` table) rather than JWT — sessions can be revoked instantly (ban path purges every row), session state is the source of truth, and we don't have to manage a refresh-rotation flow.
- `allowDangerousEmailAccountLinking: true` is safe with Google + Apple because both providers always set `email_verified` correctly. We do NOT enable it for the magic-link `nodemailer` provider (no risk because magic-link already requires inbox access).
- The Auth.js error page is set to `/` — magic-link expiry, OAuth `access_denied`, and ban-gate rejections all land back on the homepage. Connected-accounts errors surface via `?error=…` query strings.
- **Magic-link templates are custom** (`lib/auth-email.ts`). The Nodemailer provider's default template is overridden via `sendVerificationRequest` so every transactional email follows the same brand language.
- **Connected accounts UI** (`components/account/settings/AccountSection.tsx`) lets users add/remove sign-in methods; the API refuses to unlink the last method (`DELETE /api/account/connected-accounts/[provider]` returns 409 `last_signin_method`). Without this, a user could lock themselves out by removing every linked provider.
- The two `NEXT_PUBLIC_*_ENABLED` flags exist because Auth.js's provider registration is server-side; the client doesn't know which providers are live unless we tell it. Showing greyed-out "soon" buttons keeps the brand presence intact while the env is being configured.

### 2FA

- **TOTP** (RFC 6238) implemented in `lib/totp.ts` — 6 digits, 30s period, SHA-1, ±1 step skew tolerance.
- Secrets generated at 160-bit, base32-encoded, **AES-256-GCM-encrypted** at rest with a key derived from `AUTH_SECRET` (so a DB leak alone doesn't compromise authenticator seeds).
- 8 single-use backup codes generated on enrolment (8 hex chars), stored as SHA-256 hashes.
- otpauth:// URI rendered as QR via `qrcode` (dynamic-imported so the bundle only loads when the user opens 2FA setup).
- Disable flow requires a current TOTP or unused backup code (same friction as sign-in, so a phished session can't quietly drop the second factor).
- Note: 2FA is **enrolment-only** at Launch 1 — sign-in does not yet challenge for a code. The setup, verify, and disable surfaces all work end-to-end; the sign-in gate is the missing piece.

### Email change

Two paths, depending on the user's connected methods (`/api/account/connected-accounts` returns `has_email_auth` + provider list):

- **Magic link** (`/api/account/email` PATCH) — sends an HMAC-signed token to the *new* address (30-min TTL). Click finalizes; an alert email goes to the *old* address (best-effort, doesn't block the change).
- **Google re-auth** (`/api/account/email/oauth/google/{start,callback}`) — for OAuth-only accounts. State HMAC ties the callback to the originating user; we don't sign them in as the new Google account, we just lift the verified email it returns.

### Sessions

`/api/account/sessions` lists/kicks Auth.js `sessions` rows. The opaque session id is `sha256(token).slice(0,16).base64url` — the raw token is never returned to the client (anyone with it could authenticate). "Kick others" deletes all rows except the current cookie's session.

---

## Privacy, biometric consent, retention

`/privacy` and `/terms` are full legal pages with **BIPA / CCPA-CPRA / GDPR Art. 9** alignment. Face scans are biometric information under BIPA, biometric identifiers under TX/WA statutes, sensitive personal information under CCPA-CPRA, and special-category data under GDPR Art. 9 — the consent posture is shaped explicitly around those frameworks.

The lifecycle of a user's biometric data:

1. **Consent gates** — three modals require affirmative checkbox-tick consent before processing:
   - **`PrivacyModal`** on `/scan` (`holymog-consent-accepted` localStorage flag) — first scan ever.
   - **`BattleConsentModal`** on `/mog` and `/mog/battle` (`holymog-battle-consent-accepted` flag) — first battle ever, public or private.
   - **`LeaderboardModal`** before submitting to the public board (`scanDataConsent` state inside the modal) — reaffirms that the scan image is saved server-side regardless of whether the public-photo toggle is on.
2. **Scan capture** — every scan from a signed-in user is archived to the `holymog-scans` **private** bucket at `{user_id}/{scan_id}.{ext}` (no anon scans are stored). Battle peak frames go to the separate `holymog-battles` **private** bucket at `{battle_id}/{user_id}.jpg` (one image per user per battle, overwrites in place when a call beats the prior peak). The Gemini live-meter call and battle scoring also forward raw frames to Vertex AI for inference; per Google Cloud Service Specific Terms for Vertex AI, customer data isn't used to train foundation models and isn't retained beyond the request.
3. **Public surfacing** — only happens via two explicit opt-ins. The leaderboard photo toggle (`profiles.hide_photo_from_leaderboard` default off, but the user clicks "include photo" in `LeaderboardModal` to actually publish). The public profile (`/@username`) shows display name + bio + banner + socials + best-scan-score (number only) + tier letter + ELO + battle history numerically — but **never** the saved scan image unless the leaderboard photo opt-in is on.
4. **High-score review** (`overall >= 87`) — the `requires_review` flag is set on `scan_history`. The admin gets an email with a 7-day signed URL to the private image plus one-click `Approve` / `Decline & remove` buttons. Each action URL is HMAC-signed (`lib/reviewToken.ts`) and lands on `app/admin/review/[scanId]/[action]/page.tsx`. **Approve** is acknowledgement only — no DB write, leaderboard entry stays. **Decline** removes the leaderboard row + the photo from `holymog-uploads`, deletes the `pending_leaderboard_submissions` row so the user can't re-promote the same scan, audit-logs `scan_declined`. The user's `scan_history` row itself stays (it belongs to the user, only the public surfacing is reversed).
5. **GDPR Art. 20 data export** — `GET /api/account/download` returns a single `mog.json` blob with profile, scans, battles, ELO history, audit log, purchases, inventory, connected providers, session expiries. `Content-Disposition: attachment` triggers a browser download. **TOTP secret, backup-code hashes, and OAuth access/refresh tokens are deliberately excluded** so an exporter can't impersonate the user even if the file is leaked.
6. **Account deletion** — `DELETE /api/account/me` cascades through every FK (`profiles`, `leaderboard`, `battle_participants`, `matchmaking_queue`, `accounts`, `sessions`, `scan_history`, `elo_history`, `email_preferences`, `user_inventory`, `stripe_purchases`) and best-effort-removes the avatar + leaderboard image from storage. Audit row is written **before** the delete because `audit_log.user_id` is `ON DELETE SET NULL` — the forensic row survives the cascade so we can reconstruct what happened during incident response.

**Retention** (`/privacy` § 8, enforced by the daily prune cron):
- Account data: until user deletion.
- Best-scan score breakdowns (numbers only, in `profiles.best_scan` jsonb): while account is active.
- Leaderboard photos: ≤ 30 days after removal / account deletion.
- Battle records (`battles` + `battle_participants` rows): while account is active; pruned at 1 year for finished/abandoned.
- Battle video/audio: **never** stored.
- Battle peak frames (`holymog-battles`): ≤ 1 year from battle, longer when tied to an open report.
- Battle reports (`battle_reports`): ≤ 2 years from filing (forensic retention for bans + appeals).
- Rate-limit / abuse logs (`scan_attempts`): ≤ 90 days.
- Audit log: ≤ 1 year.
- All biometric identifiers: ≤ 3 years from last interaction (BIPA-compliant).

**Posture:**
- **Consent is affirmative, not implied** — a single button click doesn't count; the user must tick a checkbox AND click "accept". This is the BIPA / GDPR Art. 9 informed-consent posture.
- **The private archive is non-negotiable** — even users who never submit to the public leaderboard have their signed-in scans saved to `holymog-scans` (and battle peak frames to `holymog-battles`). The `LeaderboardModal`'s separate `scanDataConsent` checkbox exists specifically because users tend to read "I'm just submitting a score" as if the image isn't stored.
- **We do not sell or share personal information** for cross-context behavioural advertising under CCPA-CPRA. We don't run third-party analytics, advertising, or tracking cookies. The only cookies set are Auth.js's first-party session token and the HMAC-signed anon-id cookie used by anonymous scan-limit tracking.
- **Breach notification** — GDPR Art. 33 (72-hour supervisory authority notification) explicitly documented in `/privacy` § 16. We notify affected users without undue delay where the breach is likely to result in a high risk to rights and freedoms.
- **DMCA notices** go to `dmca@holymog.com` (per `/terms` § 12); abuse to `safety@holymog.com`; general inquiries to `hello@holymog.com`.
- **Children under 13** are not knowingly served — Terms § 2 + Privacy § 14. If we learn we've collected data from a child under 13 we delete it and terminate the account.

---

## Storage buckets

Four Supabase Storage buckets, each with a distinct public/private posture and access pattern. All writes go through the **service-role client** (`getSupabaseAdmin()` in `lib/supabase.ts`); the anon client is only used for reads against the public bucket.

| Bucket | Public? | Contents | Path scheme |
|---|---|---|---|
| `holymog-uploads` | **yes** (public read) | avatars, banners, leaderboard photos | `avatars/{userId}.png`, `banners/{userId}.{jpg,png,webp,gif,mp4}`, leaderboard `{uuid}.jpg` |
| `holymog-scans` | no | every signed-in scan | `{userId}/{scanId}.{jpg,png}` |
| `holymog-battles` | no | peak frame per user per battle (overwrites on new peak) | `{battleId}/{userId}.jpg` |
| `holymog-cosmetics` | TBD | reserved for Launch 2 designer cosmetic assets | — |

**Public bucket (`holymog-uploads`)** — written by:
- `POST /api/account/avatar` — stable per-user path so each upload overwrites the previous avatar. Sharp pipeline, then `users.image` is updated with a cache-busted public URL (`?v={Date.now()}`).
- `POST /api/account/banner` — stable per-user path; subscriber-only animated formats (GIF/MP4 ≤ 8MB) skip the sharp pipeline (sharp can't re-encode video). Static images go through sharp → JPEG q85.
- `POST /api/leaderboard` — when the user opts into "show my face on the board", the server downloads their most recent `scan_history.image_path` from `holymog-scans`, re-encodes through `safeImageUpload('leaderboard')` (sharp re-encode strips EXIF; 1024px longer-edge cap, JPEG q85), uploads at `{uuid}.jpg`. The path is stored in `leaderboard.image_path` so the row's previous photo can be removed when the row is updated or deleted.

**Private buckets (`holymog-scans`, `holymog-battles`)** — never publicly readable; access requires a service-role short-lived signed URL:
- `holymog-scans` is written by `/api/score` after every signed-in scan succeeds. The image is sent through Vertex AI for scoring, then the same bytes are uploaded to `{userId}/{scanId}.{ext}`. Used by `LeaderboardModal` (to copy the scan into the public bucket if the user opts in), `MoreDetail` (full-fidelity breakdown view), and the admin high-score review email (7-day signed URL).
- `holymog-battles` is written by `/api/battle/score` when this call's score beats the user's existing peak in `battle_participants` (see [Reports + bans](#reports--bans)). Path is stable per `(battleId, userId)` so re-peaks overwrite in place. Used by `/api/battle/report` (7-day signed URL embedded in the admin email) and by manual private-party complaints routed through `hello@holymog.com`.

**Image safety pipeline** — every user-uploaded image (avatar, banner, leaderboard) passes through `lib/imageUpload.ts:safeImageUpload(buffer, kind)` before hitting storage. Three goals:

1. **Strip ALL metadata** (EXIF, GPS, camera serial, timestamps, ICC profiles). Phone cameras embed GPS coordinates by default; we don't want to publish them on the leaderboard.
2. **Re-encode the raster** so any embedded malicious payload (a polyglot file that's both valid PNG and a valid JS payload) gets normalised into a clean image-only output. `sharp` pipes through libvips which decodes + re-encodes from scratch.
3. **Cap spatial dimensions** so a 12000×9000 phone selfie can't be used to fill the bucket or DoS a client trying to load it.

Per-kind specs:
- **Avatar**: 512px longer-edge, PNG (transparent initial-fallback support), 4MB input cap.
- **Banner**: 2400px longer-edge, JPEG q85 mozjpeg, 8MB input cap.
- **Leaderboard**: 1024px longer-edge, JPEG q85 mozjpeg, 4MB input cap.

Sharp's `.rotate()` auto-applies EXIF orientation before stripping (otherwise users' photos would render sideways). `failOn: 'error'` rejects corrupt headers, decode failures, non-image inputs — callers catch and return 400 `invalid_image`.

**Cache-busted URLs**: every avatar / banner upload appends `?v={Date.now()}` to the resulting public URL written to `users.image` / `profiles.banner_url`. Browsers and Next/Image refresh immediately on the next read; without the buster the CDN serves the old bytes until the cache key expires.

**Path stability vs new-UUID**: avatars and banners use **stable per-user paths** so each upload overwrites the previous file in place (no orphan cleanup needed). Leaderboard photos use **new UUIDs per submission** so the old photo can be best-effort-deleted by path lookup before the row's `image_path` is overwritten. Scans and battle peak frames sit between: scans use `{userId}/{scanId}.{ext}` (immutable per scan), battle peaks use `{battleId}/{userId}.jpg` (overwrites on re-peak within the same battle).

---

## Realtime

Battles need a real-time data channel between clients (score updates, finish events, late joins) but our auth stack doesn't align with Supabase's RLS model. The compromise: **server-side HTTP broadcast** + **client-side websocket subscription**, with auth enforced server-side rather than via RLS.

**Server-side**: `lib/realtime.ts:broadcastBattleEvent(battleId, event, payload)` is the single entry point. Stateless POST to Supabase Realtime's HTTP-only API at `/realtime/v1/api/broadcast`. No channel subscribe/unsubscribe round-trip per call, no websocket on the server, no shared state between API routes — just an HTTP POST that fans out to every subscribed client. Silently no-ops when Supabase env isn't configured (local dev).

**Client-side**: `lib/supabase-browser.ts` exposes a singleton browser client. The Realtime websocket is reused across components — opening multiple `.channel('battle:foo')` subscriptions doesn't open multiple sockets. The client subscribes to the `battle:{id}` topic and reacts to broadcast events.

Events on the `battle:{id}` topic:
- **`participant.joined`** — fires from `/api/battle/join`; lobby UI on `/mog` re-fetches the participant list via `/api/battle/{id}/participants`. Polling at 4s interval is the fallback when Realtime is unreachable for any client.
- **`participant.left`** — fires from `/api/battle/leave` (called via `navigator.sendBeacon` on tab-close so it survives the page unload); the corresponding battle tile dims to 35% opacity with a "LEFT" pill so the others see who's gone in real time.
- **`battle.starting`** — fires from `/api/battle/start`; private-battle clients in the lobby transition to BattleRoom and mint their LiveKit token. The host clicks "start", the server flips `battles.state = 'starting'` with `started_at = now() + 3s`, and broadcasts — every lobby client picks it up simultaneously.
- **`score.update`** — fires from `/api/battle/score`; clients update the live score + improvement label on the corresponding tile via the BattleRoom subscription. The payload carries `{ user_id, overall, improvement, peak, ts }`. The client uses the broadcast as the source of truth — not the response of its own score-call request — so all clients render the same scores at roughly the same time regardless of who fired the request.
- **`battle.finished`** — fires from `/api/battle/finish`; all clients transition to the result screen. Payload carries the full participant list with `peak_score`, `is_winner`, `is_tie`, plus ELO deltas for public 1v1.
- **`battle.rematch`** — fires from `/api/battle/rematch`; any client still on the result screen for the OLD battle auto-follows into the NEW lobby. Lets the host click "rematch" once and have everyone arrive together.

**Why HTTP broadcast over Postgres `postgres_changes`**: our RLS policies are written against `auth.uid()` which Auth.js sessions don't satisfy — Auth.js owns user sessions independently of Supabase Auth, so `auth.uid()` is null on every client query. We'd either have to mirror sessions into Supabase Auth (complex, error-prone) or bypass RLS for the realtime path. The HTTP broadcast endpoint uses the anon key as the apikey header and **doesn't go through RLS at all** — the topic name itself (`battle:{id}`) is the only access control, and since battle IDs are server-issued UUIDs, guessing one to subscribe to is computationally infeasible. We enforce participation server-side in the routes that emit events.

**Posture:**
- Broadcast is **best-effort**, not transactional. A failed broadcast doesn't unwind the request that triggered it. Score updates use the broadcast for UI sync but the DB write happens first; if the broadcast drops, the next score call refreshes the picture.
- The client never trusts a broadcast payload for state that the server is the source of truth on (peak score, who's the winner). The broadcast is the *signal*; the next API request is the *verification*.
- We never broadcast PII or auth tokens. The score update payload is the user_id (already public on the leaderboard) plus the score, not the user's email or session token.

---

## Rate limiting, budget cap, kill switches, audit

### Rate limiting

`lib/ratelimit.ts` — named presets keyed by Upstash Redis. Each preset gets its own prefix so buckets don't collide across endpoints.

| Preset | Tokens / window | Used by |
|---|---|---|
| `default` | 10 / 1m | generic fallback |
| `quickScore` | 60 / 1m | live-meter calls (5 per legitimate scan) |
| `battleScore` | 30 / 1m | per-frame battle scoring |
| `battleJoin` | 20 / 1m | private-code join attempts (anti-enumeration) |
| `username` | 3 / 1h | username changes, email changes |
| `accountMutate` | 20 / 1m | general account mutations |
| `accountAvatar` | 5 / 1h | avatar uploads (churn ceiling) |
| `leaderboardSubmit` | 5 / 1h | promote-to-leaderboard (~$0.01 of Gemini per submission) |
| `battleCreate` | 10 / 1h | private-battle creation (caps code-keyspace burn) |
| `battleReport` | 10 / 1h | post-match reports against a public 1v1 opponent. DB dedupe on `(battle_id, reporter, reported)` bites first; this is a global spam cap |

Local dev without Upstash configured: `getRatelimit()` returns `null` and every limiter call is a pass-through.

### Daily Gemini budget cap

`lib/costCap.ts` — `DAILY_GEMINI_BUDGET_USD` (default $30 ≈ 10K full scans/day). Every Gemini call is preceded by `checkBudget()`, which reads today's Upstash counter (UTC-day-keyed). Crossed → 503 `system_unavailable`. Post-call accounting (`recordCost`) computes USD from token counts at Gemini 2.5 Flash Lite pricing ($0.10/$0.40 per M tokens).

This is the **load-bearing** cost defense — Origin guard (below) is the cheap first line; the budget cap is the hard ceiling.

### Origin guard

`lib/originGuard.ts` — `requireSameOrigin(request)` checks `Origin` header (then `Referer` fallback) against an allowlist derived from `NEXT_PUBLIC_APP_URL` + `holymog.com` + `www.holymog.com` (+ `localhost:3000/3001` in dev only). Cross-origin scripts can't forge Origin without the user's full cooperation, so off-the-shelf bots get rejected with `403 origin_forbidden`. Determined attackers with a custom backend can still spoof Origin — the budget cap catches them.

Localhost is explicitly **dev-only** in the allowlist so a server-side attacker can't curl with `Origin: http://localhost:3000` and bypass the gate in production.

### Kill switches

`lib/featureFlags.ts` — four env-var flags read at request time. Setting any to `"1"` / `"true"` / `"yes"` / `"on"` returns 503 from the affected routes immediately. Use during incident response (per `../docs/runbooks/incident-response.md`):

- `KILL_SWITCH_SCORE` → blocks `/api/score` + `/api/quick-score`.
- `KILL_SWITCH_BATTLES` → blocks `/api/battle/{create,join,queue,score,finish}`.
- `KILL_SWITCH_LEADERBOARD` → blocks `/api/leaderboard` POST (reads unaffected).
- `KILL_SWITCH_SIGNUPS` → blocks new user creation in Auth.js (existing sessions unaffected).

### Audit log

`lib/audit.ts` — append-only `audit_log` table. **Best-effort** writes: errors are swallowed so the calling request never fails on an audit hiccup.

Logged events (non-exhaustive): `account_create`, `account_delete`, `signin`, `signout`, `username_change`, `leaderboard_submit`, `battle_create`, `battle_finish` (one row per participant with winner flag + ELO before/after/delta), `scan_approved`, `scan_declined`, `mog_alert_sent`, `subscription_updated`, `subscription_canceled`, `purchase_completed`, `purchase_refunded`, `item_granted`.

Retention: 1 year (per `/privacy`; enforced by the prune cron).

---

## Security headers + CSP

`next.config.ts` ships always-on headers:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2 years, preload-list eligible).
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (modern equivalent + legacy backstop).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), accelerometer=(), gyroscope=()`.

Production-only **CSP** (dev skipped because HMR + react-refresh need `eval()`):

- `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com` — `unsafe-inline` for Next's hydration scripts (per-request nonces are the proper fix, tracked); `wasm-unsafe-eval` for MediaPipe FaceLandmarker; `accounts.google.com` for Google OAuth popup.
- `style-src 'self' 'unsafe-inline'` — Tailwind injects style attrs everywhere.
- `img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://*.googleusercontent.com` — OAuth photos, Supabase storage, camera blobs.
- `media-src 'self' blob:` — camera capture + battle share image renders.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.aiplatform.googleapis.com https://oauth2.googleapis.com wss://*.livekit.cloud https://*.livekit.cloud`.
- `font-src 'self' data: https://fonts.gstatic.com` — next/font/google.
- `frame-src 'none'`, `frame-ancestors 'none'`, `worker-src 'self' blob:` (MediaPipe workers), `object-src 'none'`, `upgrade-insecure-requests`.

URL rewrites (`next.config.ts`):
- `/@:username` → `/account/:username` (canonical public-profile URL; Next folder names with `@` collide with parallel-route syntax).
- `/@:username/followers` → `/account/:username/followers`.
- `/@:username/following` → `/account/:username/following`.

---

## Cosmetics + achievements

### Registry

`lib/customization.ts` — coded-component architecture. Every cosmetic is a React component under `components/cosmetics/{kind}/{slug}.tsx`, registered in one of four maps: `FRAMES`, `BADGES`, `NAME_FX`, `THEMES`. Launch 1 ships **10 name fx**; frames, badges, and themes are deferred to Launch 2 (the slots stay wired in the DB + API so designer assets plug in without a schema change).

### Smart cosmetics

A subset reads live user state via the `userStats` prop:
- `name.tier-prefix` — prepends the user's best-scan tier letter, tier-coloured.
- `name.callout` — appends weakest sub-score: `briangao (jawline)`.
- `name.streak-flame` — appends `7🔥` when there's an active streak.
- `name.elo-king` — appends current ELO as gold superscript: `briangao¹⁵²⁰`.

`UserStats` is threaded through every render site (leaderboard rows, battle tiles, follower lists, profile, settings preview). When the data isn't available at a site, smart fx render their empty state gracefully (`name.elo-king` with no ELO → just the name).

### Launch 1 name fx (all earnable, none for sale)

| Slug | Name | Achievement |
|---|---|---|
| `name.signed` | signed | first scan |
| `name.callout` | callout | 10 scans |
| `name.tier-prefix` | tier prefix | B-tier scan or higher |
| `name.streak-flame` | streak flame | 7-day streak |
| `name.holographic` | holographic | S-tier scan or higher |
| `name.neon` | neon | 25 battle wins |
| `name.elo-king` | elo king | 1500 ELO |
| `name.gilded` | gilded | 1700 ELO |
| `name.divine` | divine | 30-day streak |
| `name.true-adam` | true adam | S+ scan |

Visual variety: CSS-keyframe gradients (`gilded`, `holographic`, `aurora`-style), text-shadow glow (`neon`, `divine`), SVG overlays (`signed` handwritten underline, `divine` halo), data binding (`tier-prefix`, `callout`, `streak-flame`, `elo-king`), and a flagship gradient + spark glyph (`true-adam`).

### Equip pipeline

- `/api/account/equip` — server validates the slug against `catalog_items`, checks `subscriber_only` (subscribers can equip sub-only items without an inventory row), checks ownership for the rest, writes the slug to `profiles.equipped_{frame,theme,flair,name_fx}`. Badges share the `equipped_flair` slot (single slot at Launch 1).
- `/api/account/unequip` — clears the slot.
- `/api/account/equip/{frame,theme,flair,name_fx}` — separate column per kind.

### Achievement engine

`lib/achievements.ts` — `checkAchievements(userId, stats)` is **idempotent** via `ON CONFLICT (user_id, achievement_key) DO UPDATE … RETURNING xmax = 0 as inserted`. Only the grants that crossed the threshold *this call* are returned. The matching inventory row is upserted alongside (`source = 'achievement'`).

Wired at:
- `/api/score` (after every scan, with `totalScans` + `bestScanOverall`).
- `/api/battle/finish` (for the caller only — opponent grants on their next call).

Client side: `hooks/useAchievementToast.ts` is a module-level singleton queue. `pushAchievements(grants)` from anywhere in the app drains into `AchievementToastContainer` (mounted in `Providers.tsx`), which renders one emerald-bordered toast per grant with a 5-second auto-dismiss and a manual `×`.

### Shader infrastructure (for Launch 2)

`components/cosmetics/ShaderCanvas.tsx` — WebGL1 fragment-shader wrapper. Compiles a passthrough vertex shader + the consumer's frag, mounts a full-screen triangle (3 verts, no quad), provides `u_time` / `u_resolution` / `u_dpr` uniforms, handles `webglcontextlost`/`restored`, ties into `useShaderLifecycle` for reduced-motion + viewport + shader-budget gating.

`hooks/useShaderLifecycle.ts` integrates with `lib/shader-budget.ts` — a module-level counter caps **inline** shader contexts at 8 concurrent. Over-budget shaders render `StaticFallback` (radial gradient swatch matching the dominant shader color).

GLSL helpers (`components/cosmetics/glsl/`):
- `noise.ts` — Stefan Gustavson Simplex noise + FBM.
- `palette.ts` — Iñigo Quílez cyclic palette (rainbow, aurora, sunset, obsidian, gold).
- `sdf.ts` — `sdCircle`, `sdRing`, `sdSegment`, `wedgeAngle`, `bandSmooth` for anti-aliased SDF bands.

### LiveKit participant metadata

Battle tiles render the opponent's equipped cosmetics. Since fetching them per-tile would mean N DB queries, the cosmetic state is embedded in the LiveKit access token's `metadata` JSON (`lib/livekit.ts:mintLiveKitToken`). Each token carries `avatarUrl`, `equippedFrame`, `equippedFlair`, `equippedNameFx`, plus the `UserStats` fields smart cosmetics need (`elo`, `currentStreak`, `bestScanOverall`, `matchesWon`, `weakestSubScore`, `isSubscriber`). Parsed back via `parseMetadata` in `app/mog/BattleRoom.tsx`.

---

## Subscription (holymog+)

Launch 1 ships the storefront **deferred** — `/account/store`, `/account/store/success`, `/account/store/cancel` all `redirect('/account')`. The wiring is complete so Launch 2 can flip it on:

- `lib/stripe.ts` — lazy Stripe client (`apiVersion: '2025-01-27.acacia'`).
- `lib/subscription.ts:isSubscriber(userId)` — `subscription_status in ('active', 'trialing')`. `past_due` is **not** subscribed (no benefits during a broken-card grace period).
- `applySubscriberDiscount(cents)` — 20% off at line-item creation.

Subscriber benefits already gated in code:
- **Unlimited daily scans** (no 30/day cap — `lib/scanLimit.ts:attemptScan` short-circuits with `allowed: true, limit: -1`).
- **20-person private parties** (vs 10 free — `/api/battle/create`).
- **Animated banners** (GIF / MP4 — `/api/account/banner`).
- **Subscriber-only cosmetics** (gated in `/api/account/equip`; never sold via cosmetic checkout in `/api/checkout/create-session`).
- **Monthly free cosmetic** (`/api/account/redeem-monthly-cosmetic`; one frame or badge per 30 days, tracked via `profiles.monthly_cosmetic_claimed_at`).
- **20% discount** on cosmetic purchases.

`/api/webhooks/stripe` handles:
- `checkout.session.completed` (one-time mode) → record `stripe_purchases` row + grant `user_inventory` rows + audit.
- `customer.subscription.created` / `customer.subscription.updated` → mirror status, tier, period_end, stripe_subscription_id into `profiles`.
- `customer.subscription.deleted` → flip to `'canceled'`. The `expire-subscriptions` cron sweeps `canceled` / `past_due` rows whose `current_period_end < now()` and nulls the status (also unequipping any subscriber-only cosmetics).
- `invoice.payment_failed` → flip to `'past_due'`.
- `charge.refunded` → mark the purchase `'refunded'` (we don't auto-revoke inventory; admins do).

`/api/account/billing-portal` returns a Stripe Customer Portal URL for plan/card/cancel management.

---

## Cron jobs

Five scheduled jobs registered in `vercel.json`. Vercel signs every cron request with `Authorization: Bearer ${CRON_SECRET}` — verified by `lib/email.ts:verifyCronAuth` on every cron entry point. Dev mode (no `CRON_SECRET` set) accepts unauthed requests for curl testing.

### `/api/cron/weekly-digest` — Sundays at 12:00 UTC

Sunday-morning summary email of the user's week on holymog. Each invocation handles up to 100 eligible users (opted in via `email_preferences.weekly_digest = true` AND last digest > 6 days ago); Vercel cron retries until everyone's caught up. The query computes battles played, battles won, ELO delta (earliest vs latest in the 7-day window), scans this week, and best scan this week in a single round-trip per user chunk. Users whose week was empty (zero battles, zero scans) get their `last_digest_sent_at` updated **without** the email send — we don't email people whose week was nothing. Template lives in `lib/email-templates.ts:weeklyDigestEmail`.

### `/api/cron/leaderboard-displaced` — hourly

Finds users in the top-100 cutoff window whose entry has been bumped — someone landed a higher score in the last hour and pushed them down — and emails them `you got mogged by X`. Eligibility: `email_preferences.mog_alerts = true` AND the user has a leaderboard row at `overall < cutoff` AND no `audit_log` row with `action = 'mog_alert_sent'` in the last 24 hours (the cooldown — keeps the email volume sane on volatile boards). The job audit-logs each send so the dedupe lookup is the same source of truth as the send itself. Template: `lib/email-templates.ts:youGotMoggedEmail`.

### `/api/cron/prune-old-data` — daily at 03:00 UTC

Fixed-cost cleanup of stale rows across several tables. Runs in a low-traffic window to minimise lock collisions with live writes. Each prune is its own try/catch so a failure in one table doesn't abort the others. What gets pruned:

- `scan_attempts > 90 days` — rate-limit telemetry. Plenty for forensics; older rows otherwise sit forever.
- `matchmaking_queue > 5 minutes` — `pair_two()` already prunes >60s rows but tab-aways linger. Belt + braces.
- `battles` (finished/abandoned) `> 1 year` — cascades to `battle_participants` via FK ON DELETE.
- `audit_log > 1 year` — matches the retention policy in `/privacy` § 8.
- `pending_leaderboard_submissions > 1 hour` — submissions that didn't promote within an hour expire; the user re-scans to get a fresh row.

GDPR Art. 5(1)(e) (`kept in a form which permits identification … no longer than necessary`) is the explicit motivation for the prune.

### `/api/cron/expire-subscriptions` — daily at 04:00 UTC

Flips `canceled` / `past_due` subscriptions to null status when their `current_period_end < now()`. For each expired user, the job also unequips any `equipped_*` slots that point at a `catalog_items` row where `subscriber_only = true` (the cancellation grace period is over; the user is no longer entitled to the sub-only cosmetic). Idempotent — safe to re-run within the same day.

### `/api/cron/email-volume-check` — daily at 23:00 UTC

Watchdog for the Gmail Workspace SMTP cap (2,000 messages / 24h per authenticated user). Reads the last 3 completed UTC days from the `holymog:email-count:*` Upstash counter. If all three crossed `1200` (~75% of cap), fires a one-shot alert email to the operator (`briangaoo2@gmail.com` per `app/api/cron/email-volume-check/route.ts:ALERT_RECIPIENT`). The alert template explains the swap path: change `EMAIL_SERVER_HOST` / `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` in Vercel env vars to Resend SMTP credentials — Auth.js's Nodemailer provider doesn't care which SMTP server it talks to, so no code change is required. `?force=1` query param bypasses both the threshold check and the per-day dedupe for end-to-end testing.

---

## Routes and pages (`app/`)

| Path | File | Role |
|---|---|---|
| `/` | `app/page.tsx` | Home — Starfield backdrop, scan + battle hero cards with SpectralRim cursor follow, leaderboard pill, footer with terms/privacy/help/github + © 2026 |
| `/scan` | `app/scan/page.tsx` | The scan flow (~1200 LOC). PrivacyModal gate, useFlowMachine state, Camera + FaceDetected + Countdown + SpiderwebOverlay + LiveMeter orchestration, ScoreReveal → CompleteView, ShareSheet + LeaderboardModal + AuthModal, paywall view |
| `/mog` | `app/mog/page.tsx` | Mode select (find a battle / create party / join party), private lobby, joining state, reconnection check; embeds `BattleRoom` and `MogResultScreen` |
| `/mog/battle` | `app/mog/battle/page.tsx` | Full-screen public matchmaking + reconnection. Locks body scroll, polls `/api/battle/queue/status` every 1.5s |
| `app/mog/BattleRoom.tsx` | — | Shared in-battle UI: LiveKit room, tile distribution table, score overlays, countdown SFX, frame capture, phase transitions, tab-close `sendBeacon` |
| `/leaderboard` | `app/leaderboard/page.tsx` | Tabs: scans (sorted by overall) + battles (sorted by ELO). Page-1 prefetch in parallel, infinite scroll via IntersectionObserver from page 2 onward |
| `/account` | `app/account/page.tsx` | Tabs: stats / history / settings. URL-state-synced via `?tab=`. Three ambient gradient blobs anchor the page. Refresh hot-path so child mutations propagate without a full reload |
| `/account/[username]` | `app/account/[username]/page.tsx` | Public profile (server component). 301-style redirect to canonical username if the lookup hits `previous_usernames` |
| `/account/[username]/followers` | `app/account/[username]/followers/page.tsx` | Server-rendered first page of followers; client `FollowList` takes over from page 2 |
| `/account/[username]/following` | `app/account/[username]/following/page.tsx` | Mirror for following |
| `/account/[username]/not-found.tsx` | — | Custom 404 for the profile route |
| `/account/store` | `app/account/store/page.tsx` | Deferred — redirects to `/account` (Launch 1 has no monetization) |
| `/account/store/success` | `app/account/store/success/page.tsx` | Deferred — redirect |
| `/account/store/cancel` | `app/account/store/cancel/page.tsx` | Deferred — redirect |
| `/admin/review/[scanId]/[action]` | `app/admin/review/[scanId]/[action]/page.tsx` | HMAC-verified one-click approve/decline landing for high-score scan review emails. Server-renders a black/white branded page with a "back to holymog" link |
| `/admin/review/report/[reportId]/[action]` | `app/admin/review/report/[reportId]/[action]/page.tsx` | HMAC-verified one-click landing for battle-report ban/dismiss emails. `ban` sets `profiles.banned_at`, purges every session for the user, marks the report `banned`, fires `banNoticeEmail`, audit-logs. `dismiss` only marks the report `dismissed` (no user impact, no notification). |
| `/help` | `app/help/page.tsx` | FAQ with search + 6 categories (scanning / battles / leaderboard / account & privacy / billing / troubleshooting) + a contact form that POSTs to `/api/contact` |
| `/privacy` | `app/privacy/page.tsx` | Full Privacy Policy (18 sections, BIPA + GDPR + CCPA-CPRA aligned). `LegalBackLink` derives the destination + label from the back-nav breadcrumb |
| `/terms` | `app/terms/page.tsx` | Full Terms of Service (23 sections; binding individual arbitration with 30-day opt-out, mass-arbitration protocol, class-action waiver, DMCA procedure, BIPA biometric consent, two-party-consent recording prohibition) |
| `/share/[platform]` | `app/share/[platform]/page.tsx` | Interstitial that pre-copies the share image to the clipboard and redirects to the platform's compose/upload page after 2s. Allowlist on the `?to=` destination (`tiktok.com`, `instagram.com`, `snapchat.com`, `discord.com`, `reddit.com`, `wa.me`, `whatsapp.com`, `x.com`, `twitter.com`) — prevents open-redirect abuse |
| `app/layout.tsx` | — | Root layout: 3 Google fonts as CSS vars, metadata with `title: { template: 'holymog - %s', default: 'holymog' }` so child routes set `title: 'scan'` and render `holymog - scan` (regular ASCII hyphen), OpenGraph + Twitter card, viewport (`width=device-width`, `maximum-scale=1`, `viewport-fit=cover`), `Providers` wrapper. Per-route `layout.tsx` files (scan, leaderboard, help, privacy, terms, mog, mog/battle, account, share/[platform]) each set their short title. |
| `app/globals.css` | — | Tailwind import, near-black/near-white overrides, font tokens, body lowercase, overscroll-behavior:none, every name-fx keyframe + class for the inline-CSS effects |
| `app/icon.png` / `app/apple-icon.png` / `app/favicon.ico` | — | Built-in Next.js favicon convention |

---

## API routes (`app/api/`)

Every route runs in the Node.js runtime (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`) so the `pg` driver, `sharp`, `crypto`, and Auth.js work natively.

### Scoring

- **POST `/api/score`** — heavy scan. Kill switch + budget cap + Origin guard + auth + atomic scan-limit attempt + IP rate-limit. Decodes 1-6 base64 images, validates byte size (≤2MB) + dimensions (256-2048 PNG/JPEG), fans out to `analyzeFaces` (3 parallel category calls per frame). Strips `vision` for anonymous responses (defense-in-depth alongside the auth check). For signed-in users: writes `scan_history` row, archives the last image to `holymog-scans`, stashes `pending_leaderboard_submissions` (the **only** path onto the leaderboard — anti-cheat anchor), updates `profiles.best_scan` only if beaten, flags `requires_review` + emails admin if ≥87, fires `checkAchievements`. Returns `X-Tokens-Input` / `X-Tokens-Output` response headers.
- **POST `/api/quick-score`** — live meter. Kill switch + budget cap + Origin guard + IP rate-limit (`quickScore`: 60/min). Single image, single-call `analyzeQuick`, returns `{ overall }`.
- **GET `/api/scan/check`** — read-only quota state for the UI's "X scans left" indicator. Returns `{ allowed, used, limit, signedIn, reason, resetInSeconds }`.

### Auth

- **GET/POST `/api/auth/[...nextauth]`** — Auth.js v5 handlers (sign-in callback, OAuth callback, magic-link verify, session, sign-out).

### Account — profile

- **GET `/api/account/me`** — current user's profile + leaderboard entry + lifetime aggregates (ELO sparkline, total scans, account age, highest-overall-ever, most-improved metric, recent battle W/L/T ribbon, biggest win/loss, scan overalls for tier-distribution chart, weakest sub-score, is_subscriber).
- **PATCH `/api/account/me`** — partial update. Username path: `username` regex + reserved-username check + `display_name` uniqueness + previous-usernames bookkeeping (last 10 kept) + leaderboard row sync + audit + rate-limit. Field-update path: bio (≤240), location (≤60), socials (partial merge across instagram/x/snapchat/tiktok/discord, ≤32 each), and toggles (hide_photo_from_leaderboard, hide_elo, mute_battle_sfx, weekly_digest, mog_email_alerts). Notification toggles mirror to `email_preferences`.
- **DELETE `/api/account/me`** — permanent. Audit before delete (FK is `SET NULL` on user_id), `DELETE FROM users WHERE id = $1` cascades through every table. Best-effort removes the avatar + leaderboard image.

### Account — assets

- **POST/DELETE `/api/account/avatar`** — Origin guard + rate-limit (5/h). Decodes data URL → `safeImageUpload('avatar')` → uploads to `avatars/{userId}.png`. Cache-busted URL written to `users.image` + mirrored to `leaderboard.avatar_url`.
- **POST/DELETE `/api/account/banner`** — Origin guard. Two paths: static (PNG/JPEG/WEBP) through sharp → `banners/{userId}.{ext}`; animated (GIF/MP4) subscriber-only, 8MB cap, raw upload. Cache-busted URL written to `profiles.banner_url`.

### Account — leaderboard

- **DELETE `/api/account/leaderboard`** — removes the user's row + photo from storage. Idempotent.

### Account — cosmetics + inventory

- **GET `/api/catalog`** — all active catalog items, optionally filtered by kind. Signed-in users also get their `owned` slugs + currently-equipped slots.
- **POST `/api/account/equip`** — validate slug against `catalog_items`, enforce `subscriber_only`, check ownership for non-sub items, write the slug to the right `equipped_*` column.
- **POST `/api/account/unequip`** — clear a single slot by kind.
- **POST `/api/account/redeem-monthly-cosmetic`** — subscriber-only monthly free frame/badge claim. Atomic INSERT + UPDATE; 30-day cooldown via `profiles.monthly_cosmetic_claimed_at`.

### Account — 2FA

- **POST `/api/account/2fa/setup`** — generate a fresh 160-bit secret, AES-256-GCM-encrypt, store in `profiles.two_factor_secret`, return `{ secret, uri }` (otpauth://...) **once**.
- **POST `/api/account/2fa/verify`** — verify the user can produce a current TOTP, flip `two_factor_enabled = true`, generate 8 SHA-256-hashed backup codes, return plaintext codes **once**.
- **POST `/api/account/2fa/disable`** — requires a valid TOTP or unused backup code; clears secret + backup codes + flag.

### Account — email + sessions + connected accounts

- **PATCH `/api/account/email`** — initiate magic-link email change. HMAC token sent to new address; old address gets a best-effort alert.
- **GET `/api/account/email/verify`** — finalize the email change on token click.
- **GET `/api/account/email/oauth/google/start`** — kick off OAuth-based change with an HMAC-sealed state token.
- **GET `/api/account/email/oauth/google/callback`** — exchange code, verify Google reports `email_verified=true`, swap `users.email`, alert the old address.
- **GET `/api/account/sessions`** — list Auth.js sessions (opaque id = first 16 chars of base64url(sha256(token))), with `current` marker derived from the request's session cookie.
- **DELETE `/api/account/sessions`** — kick all sessions except current.
- **DELETE `/api/account/sessions/[id]`** — kick a specific session.
- **GET `/api/account/connected-accounts`** — list OAuth providers (provider + type only — never tokens) + `has_email_auth` flag.
- **DELETE `/api/account/connected-accounts/[provider]`** — unlink. Refuses to unlink the last sign-in method (409 `last_signin_method`). `email` is a synthetic provider that nulls `emailVerified`.

### Account — social graph

- **POST/DELETE `/api/account/[username]/follow`** — follow/unfollow. Idempotent. Self-follow blocked by CHECK constraint + 400. Follower/following counts kept in sync by DB triggers.
- **GET `/api/account/[username]/followers?page=N`** — paginated (50/page) follower entries with bio preview, equipped cosmetics, follower count, `viewer_is_following` (server-resolved), `is_viewer` flag, plus all `UserStats` fields for smart cosmetic rendering on rows.
- **GET `/api/account/[username]/following?page=N`** — mirror.

### Account — data + misc

- **GET `/api/account/history?page=N&kind=&result=&opponent=`** — paginated battle log with filters (`public`/`private`, `won`/`lost`, opponent prefix). Returns entries + a `summary` over the full filtered set (total, won, lost, win_rate, peak). Page size 20.
- **GET `/api/account/leaderboard`** — (also accessible via main GET — used by `useUser`-driven paths).
- **POST `/api/account/migrate-scan`** — runs after an anonymous → signed-in transition when the localStorage cache has a full vision payload. Re-scores server-side, conditionally writes to `profiles.best_scan` (only if beaten — race-safe).
- **POST `/api/account/reset-stats`** — zeros ELO/peak/streaks/improvement_counts/best_scan. Battle history rows preserved.
- **GET `/api/account/download`** — GDPR Art. 20 export. Single `mog.json` blob, `Content-Disposition: attachment`.

### Battles

- **POST `/api/battle/create`** — host creates a private battle. Kill switch + Origin guard + rate-limit (10/h). Generates a Crockford code, retries up to 5 times on collision. Inserts `battles` + first `battle_participants` row in a transaction. Sets `max_participants = 20` for subscribers else 10.
- **POST `/api/battle/join`** — joiner enters a private code. Per-user-per-IP rate-limit (20/min) blocks code enumeration. Validates state == `lobby`, capacity, idempotent on existing rows. Broadcasts `participant.joined`.
- **POST `/api/battle/start`** — host-only. Validates ≥2 participants, sets `state = 'starting'`, `started_at = now() + 3s`. Broadcasts `battle.starting`.
- **POST `/api/battle/queue`** — public matchmaking. UPSERT into `matchmaking_queue`, then calls Postgres `pair_two()`. Returns `{ battle_id, paired: true }` if matched or `{ queued: true }` if waiting.
- **DELETE `/api/battle/queue`** — cancel queue entry.
- **GET `/api/battle/queue/status`** — poll target. Returns `{ paired, battle_id?, state?, started_at? }`.
- **POST `/api/battle/score`** — per-frame scoring. Kill switch + budget cap + Origin guard + rate-limit (30/min). Validates state ∈ `{starting, active}` and elapsed ∈ `[-3000, 11000]ms` from `started_at`. `analyzeBattle`, bumps `peak_score` with `greatest()`, bumps `improvement_counts`, broadcasts `score.update`.
- **POST `/api/battle/finish`** — idempotent finalization. Locks the battles row, sorts participants by peak desc + joined_at asc, marks winner (or ties), applies ELO updates (`computeElo` / `computeEloTie`) for public 1v1, writes `elo_history` rows, broadcasts `battle.finished`, fires `checkAchievements` for the caller.
- **POST `/api/battle/leave`** — marks participant `left_at`. Idempotent. Broadcasts `participant.left`. Called via `navigator.sendBeacon` on tab-close.
- **POST `/api/battle/rematch`** — private-battle-only. Creates a fresh battle with the same participant set, broadcasts `battle.rematch` on the OLD channel so any client still on the result screen auto-follows.
- **POST `/api/battle/report`** — public-1v1-only post-match report. Origin guard + auth + rate-limit (`battleReport` 10/h). Validates both participants were in the battle, `kind = 'public'`, and `state in ('finished', 'abandoned')`. Inserts a `battle_reports` row (ON CONFLICT dedupes on `(battle_id, reporter, reported)`), mints a 7-day signed URL on `holymog-battles` for the reported player's peak frame, signs ban + dismiss tokens, fires `battleReportEmail` to `ADMIN_REVIEW_EMAIL`. Reporter sees a generic ack; reported user is not notified.
- **GET `/api/battle/[id]/state`** — returns `{ id, kind, state, started_at }`. Caller must be host or participant. Exists because RLS blocks the anon-key REST path.
- **GET `/api/battle/[id]/participants`** — lobby polling fallback. Same auth.
- **GET `/api/battle/[id]/token`** — mints a LiveKit access token bound to the battle's `livekit_room`, embeds the caller's cosmetic state + UserStats in token metadata.

### Leaderboard

- **GET `/api/leaderboard?page=N`** — top-100 entries per page sorted by overall. Joins profiles for hide_photo_from_leaderboard, equipped cosmetics, subscription status, and smart-cosmetic stats.
- **POST `/api/leaderboard`** — promote a pending submission. Kill switch + Origin guard + auth + rate-limit (5/h). Reads `pending_leaderboard_submissions` (populated by `/api/score`, 1h TTL); if `include_photo`, downloads the most recent `scan_history.image_path` from `holymog-scans`, re-encodes through `safeImageUpload('leaderboard')`, uploads to `holymog-uploads/{uuid}.{ext}`. Consumes the pending row, audit-logs.
- **GET `/api/leaderboard/battles?page=N`** — ELO board. Excludes users with `hide_elo = true` entirely (showing the row without ELO leaks it via bounding ranks).

### Payments

- **POST `/api/checkout/create-session`** — body is `{ items: [slug, ...] }` (one-time mode, 20% subscriber discount applied server-side) OR `{ subscription: 'monthly' | 'annual' }` (recurring). Returns `{ url, session_id }`.
- **POST `/api/account/billing-portal`** — returns a Stripe Customer Portal URL.
- **POST `/api/webhooks/stripe`** — verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET`, handles `checkout.session.completed`, `charge.refunded`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Idempotent via `stripe_purchases.stripe_session_id` UNIQUE.

### Admin

- **POST `/api/admin/grant`** — caller must be in `ADMIN_USER_IDS`. Body `{ user_id? | username?, slug, source? }`. ON CONFLICT DO NOTHING — idempotent grants. Audit-logged.

### Cron

- See [Cron jobs](#cron-jobs) above. All five paths require `Authorization: Bearer ${CRON_SECRET}`.

### Misc

- **POST `/api/contact`** — contact form forwarder. IP-rate-limited. Signed-in users get email auto-attached as `replyTo`; anonymous senders supply their own.
- **POST/DELETE `/api/debug-log`** — dev-only (`NODE_ENV !== 'production'`). Appends/clears `/tmp/holymog-debug.log`. In production returns 404 so attackers can't fingerprint or abuse it.

---

## Library modules (`lib/`)

### Core infrastructure

| File | Role |
|---|---|
| `lib/db.ts` | Postgres pool singleton. `max: 5`, 10s idle timeout, 5s connection timeout. SSL with `rejectUnauthorized: false` for managed Postgres (the URL is the proof of identity). |
| `lib/auth.ts` | Auth.js v5 config + handlers. Dynamic provider list (Google/Apple/Nodemailer), database session strategy, custom magic-link template, `createUser`/`signIn`/`signOut` audit hooks. **Ban gate**: `callbacks.signIn` checks `profiles.banned_at` and returns `false` if set, blocking new sessions for banned users (existing sessions are purged at ban time in `/admin/review/report/[reportId]/ban`). Fails open on Postgres hiccup so a DB blip can't lock every user out. |
| `lib/supabase.ts` | Supabase client factories: anon (`getSupabase`) + service-role (`getSupabaseAdmin`). Exports `UPLOADS_BUCKET`, `BATTLES_BUCKET`, and the `LeaderboardRow` shape. |
| `lib/supabase-browser.ts` | Browser-side Supabase client (singleton). Realtime websocket reused across components. No persistence — Auth.js owns sessions. |
| `lib/livekit.ts` | `mintLiveKitToken({ room, userId, displayName, … })` — 30-minute TTL, embeds cosmetic state + UserStats in metadata. |
| `lib/realtime.ts` | `broadcastBattleEvent(battleId, event, payload)` — stateless HTTP broadcast to Supabase Realtime. |
| `lib/stripe.ts` | Lazy Stripe client (`apiVersion: '2025-01-27.acacia'`). `appUrlFor(path)`. |
| `lib/email.ts` | Nodemailer transport wrapper (`sendEmail`), `verifyCronAuth` (Bearer ${CRON_SECRET}), `appUrl(path)`. |
| `lib/email-templates.ts` | Inline-styled HTML templates: weeklyDigestEmail, youGotMoggedEmail, highScoreReviewEmail, **battleReportEmail** (admin notice with peak-frame image + ban/dismiss buttons), **banNoticeEmail** (delivered to the user being banned, points appeals at safety@holymog.com). Brand fonts + neutral palette readable on light or dark clients. |
| `lib/auth-email.ts` | Magic-link sign-in template. No images (avoids dev-mode broken-image links + spam-filter noise). |
| `lib/emailVolume.ts` | Per-UTC-day Upstash counter for outbound email volume. `recordEmailSent`, `getEmailCount(daysAgo)`, `hasAlertedToday`, `markAlerted`. |

### Scoring + tier

| File | Role |
|---|---|
| `lib/vision.ts` | Vertex AI client. `analyzeFace`, `analyzeFaces` (N frames in parallel), `analyzeQuick` (live meter), `analyzeBattle` (per-frame battle). Holds the 200-line `ANCHOR_RUBRIC` shared across the 3 category prompts. Pinned region (default `us-central1`). Cost is recorded on every call via `costCap.recordCost`. |
| `lib/scoreEngine.ts` | `combineScores(vision)` → `FinalScores`, `computePresentation(vision)`, `weakestSubScore(scores)`. Anchor clamp at `overall_attractiveness ≤ 15`. |
| `lib/tier.ts` | 18-band tier table, `getTier(score)`, `getTierDescriptor(letter)`, `PHOTO_REQUIRED_THRESHOLD = 87`. |
| `lib/scoreColor.ts` | Score → HSL color, banded to match the tier system. S band is sapphire (differentiates from green A). |
| `lib/elo.ts` | `computeElo` (winner + margin multiplier + autocorrelation damping), `computeEloTie`. Provisional/settled K-factors (32/16). |
| `lib/faceLandmarker.ts` | MediaPipe FaceLandmarker singleton loader. Installs a console.error filter to silence the TFLite XNNPACK INFO line that Next dev surfaces as a red error. Warms up with a 1×1 canvas so the first real `detectForVideo` doesn't pay the lazy-init cost. |

### Quota + cost + abuse

| File | Role |
|---|---|
| `lib/scanLimit.ts` | Anonymous lifetime limit, signed-in daily limit (30, warning at 25), per-IP daily anonymous cap (3). `checkScanLimit` (read-only), `attemptScan` (atomic check + insert under `pg_advisory_xact_lock`), `rollbackScanAttempt` (refund on Vertex failure). `readClientIp` with IPv4/IPv6 regex sanitization. |
| `lib/costCap.ts` | Daily Gemini USD spend cap. `checkBudget`, `recordCost(input, output)`. UTC-day-keyed Upstash counter with 7-day TTL. Fails open on Upstash blips (rate limiters provide partial backpressure). |
| `lib/ratelimit.ts` | Named Upstash Ratelimit presets (default, quickScore, battleScore, battleJoin, username, accountMutate, accountAvatar, leaderboardSubmit, battleCreate). |
| `lib/originGuard.ts` | `requireSameOrigin(request)` against an allowlist derived from `NEXT_PUBLIC_APP_URL` + canonical hosts + dev localhost. |
| `lib/featureFlags.ts` | Four env-var kill switches. |
| `lib/audit.ts` | `recordAudit({ userId, action, resource?, metadata?, ipHash?, userAgent? })`. Best-effort writes. |
| `lib/anonymousId.ts` | HMAC-signed anon cookie (`hm_aid`). 1-year TTL. Used by anonymous scan-limit tracking. |
| `lib/reviewToken.ts` | HMAC-signed `(id, action, expires)` token for one-click admin email links. `id` is a `scanId` for high-score scan review or a `reportId` for battle-report ban/dismiss; the HMAC input is identical so one generic signer/verifier serves both. `ReviewAction` union covers `'approve' \| 'decline' \| 'ban' \| 'dismiss'`. 7-day TTL, AUTH_SECRET signing. |
| `lib/totp.ts` | RFC 6238 TOTP, AES-256-GCM secret encryption, backup codes (SHA-256 hashed), `tokenize/detokenize` HMAC-signed change tokens for the email-change flow. |
| `lib/reservedUsernames.ts` | Block-list for usernames that would route-collide or impersonate the brand. |

### Game state + features

| File | Role |
|---|---|
| `lib/customization.ts` | Cosmetic registry — `FRAMES`, `BADGES`, `NAME_FX`, `THEMES` maps; `getFrame/getBadge/getNameFx/getTheme` lookups; `isValidItemSlug`, `itemKindFromSlug`; `UserStats` type; `SMART_SLUGS` set. |
| `lib/achievements.ts` | 10 achievement definitions + `checkAchievements(userId, stats)` idempotent grant path. |
| `lib/activeBattle.ts` | localStorage reconnection state for battles. 15-minute window. |
| `lib/battle-code.ts` | Crockford-base32 6-char codes. `generateBattleCode`, `normaliseBattleCode`, `isValidBattleCode`. |
| `lib/battleSfx.ts` | Web Audio synth: countdown ticks, "go", win triad, loss minor descent. `setMuted` reads from `mute_battle_sfx` once per BattleRoom mount. |
| `lib/publicProfile.ts` | `lookupPublicProfile(username, viewerUserId?)` — joins profiles + users + scan_history + battle_participants + leaderboard + elo_history + user_inventory + follows. Returns `{ kind: 'found' | 'redirect' | 'not_found' }`. |
| `lib/leaderboardCache.ts` | sessionStorage cache for the scans leaderboard's page 1. 5-minute TTL. `prefetchLeaderboard` fires from `/scan` complete so opening `/leaderboard` is instant. |
| `lib/subscription.ts` | `isSubscriber(userId)` (status ∈ {active, trialing}), `applySubscriberDiscount(cents)` (× 0.8 floored). |
| `lib/back-nav.ts` | sessionStorage breadcrumb for `/terms` and `/privacy` back-link routing. `saveBackNav`, `readBackNav`, `clearBackNav`, `consumeModalRestore` (read + clear), `labelForPath`, `captureCurrentAsBack`. |

### Image generation + I/O

| File | Role |
|---|---|
| `lib/imageUpload.ts` | `safeImageUpload(buffer, kind)` — sharp pipeline. Per-kind specs (avatar/banner/leaderboard). `decodeDataUrl(dataUrl)`. |
| `lib/shareImageGenerator.ts` | 1080×1920 PNG of a scan result — mirrors `ScoreReveal`: avatar circle (tier-color ring), huge tier letter, big score number, lowercase descriptor, 2×2 sub-score grid (jawline/eyes/skin/cheekbones). Falls back to `N/A` + zinc when `scores.fallback === true`. Exports the shared canvas helpers (`readFonts`, `loadImage`, `roundedRect`, `anyColorToRgb`) used by both generators. |
| `lib/battleShareImageGenerator.ts` | 1080×1920 PNG of a battle result — mirrors `MogResultScreen`: glowing headline (`YOU MOGGED` / `GOT MOGGED` / `TIED`), lowercase subhead (`you cooked @opponent.`), vs board (two cards with score + tier + progress bar + name), margin pill, ELO pill (public only). Reads `--font-space-grotesk` / `--font-dm-sans` / `--font-mono-numeric` from the document at draw time so the canvas uses the same faces as the live UI. |
| `lib/shader-budget.ts` | Module-level counter capping inline shader contexts at 8 concurrent. `acquireShaderSlot`, `releaseShaderSlot`, `onShaderBudgetChange`. |

### Request plumbing

| File | Role |
|---|---|
| `lib/errors.ts` | `publicError(code, internal?, message?)` — logs `internal` server-side, returns `{ error: code, message? }` to the client. |
| `lib/parseRequest.ts` | `parseJsonBody(request, schema)` → `{ data }` or ready-to-return 400 NextResponse with first issue surfaced as a user-facing message. |
| `lib/schemas/common.ts` | `ImageDataUrl` (regex + 10MB cap), `CosmeticSlug`, `BattleCode` (normalizes + validates), `BattleId` (uuid), `DisplayName` (3-24 chars). |
| `lib/schemas/account.ts` | `MePatchBody`, `AvatarPostBody`, `BannerPostBody`, `EquipPostBody`, `UnequipPostBody`, `EmailPatchBody`, `TwoFactorVerifyBody`, `TwoFactorDisableBody`, `RedeemMonthlyBody`, `MigrateScanBody`, `ContactBody`, `AdminGrantBody`, `FollowParam`, `LeaderboardPostBody`. |
| `lib/schemas/battle.ts` | `BattleCreateBody`, `BattleJoinBody`, `BattleStartBody`, `BattleScoreBody`, `BattleFinishBody`, `BattleLeaveBody`, `BattleRematchBody`. |
| `lib/schemas/score.ts` | `ScoreBody` (images[] OR imageBase64), `QuickScoreBody`. |
| `lib/schemas/report.ts` | `BattleReportBody` (battle_id + reported_user_id + reason ∈ {cheating/minor/nudity/harassment/spam/other} + optional details ≤1000). Refine: `other` requires non-empty details. `REPORT_REASONS` constant exported for the client modal. |

---

## Hooks (`hooks/`)

| Hook | Role |
|---|---|
| `useUser` | Thin wrapper over Auth.js's `useSession`. Memoizes the user object on its primitive fields so consumer `useEffect`s don't fire on every render. Exposes `{ user, loading, signOut }`. |
| `useFlowMachine` | `useReducer` for the scan flow state machine. States: idle / streaming / detected / capturing / mapping / revealing / complete / error. Actions: CAMERA_READY / FACE_STABLE / FACE_LOST / CAPTURE / MAPPING_DONE / REVEAL_DONE / RETAKE / HYDRATE / ERROR. |
| `useFaceDetection` | MediaPipe FaceLandmarker loop. Every other animation frame (toggleRef) at most. Requires 3 stable frames to flip `isDetected: true`. Reports `multipleFaces` separately. Returns latest 478-point landmark array. |
| `useAchievementToast` | Module-level singleton queue. `pushAchievements(grants)` from anywhere; hook returns `{ queue, dismiss }`. |
| `useDocumentVisibility` | Reactive `document.visibilityState`. Shader components pause RAF when tab is hidden. |
| `useShaderLifecycle` | Wires IntersectionObserver (inline only) + prefers-reduced-motion + visibility + shader-budget. Returns `{ disabled, paused, dpr }`. DPR capped at 2.0. |
| `useShare` | Share-flow orchestration. `generateShareImage` cached. Native share preflight via `navigator.canShare({files})`. Per-platform handlers: native, X (intent URL), Reddit (submit URL), WhatsApp (`wa.me/?text=…`), iMessage (`sms:&body=…`), and copy-and-redirect for TikTok / Instagram / Snapchat / Discord. Copy image + copy link + toast. Strips emojis from URL-bound copy (WhatsApp mojibakes them). |
| `useSubscription` | Client-side mirror of `isSubscriber`. One-shot fetch of `/api/account/me` on user change. Drives AdSlot, SubscriberBadge, sub-only equip CTAs, 20% strike-through pricing, monthly claim banner. |

---

## Components (`components/`)

### Layout + chrome

- **`Providers`** — wraps `SessionProvider`, `ScanMigrationWatcher` (lifts the localStorage scan into the account on first sign-in), and `AchievementToastContainer`.
- **`AppHeader`** — sticky wordmark + `AccountAvatar` (sign-in chip when logged out, frame-wrapped avatar when in).
- **`AccountAvatar`** — header chip. Reads from sessionStorage cache synchronously (`useLayoutEffect`) to avoid flashing the email-seeded fallback hue. Re-fetches `/api/account/me` on the `holymog:profile-changed` window event.
- **`AvatarFallback`** — deterministic initial-circle. Hue derived from a stable hash of the seed (display_name preferred over email).
- **`FullPageSpinner`** — full-viewport CSS-only spinner.
- **`LegalBackLink`** — derives "back to scan" / "back to leaderboard" / "back home" label from `readBackNav()` for `/terms` and `/privacy`.
- **`Starfield`** — home-page cosmic backdrop. ~180 stars + 4 planets (1 Saturn-ringed). Cursor-reactive physics (lagging tracked mouse position lerps toward the real one; particles push outward with a 1/mass falloff). Stars use CSS vars (`--tx`/`--ty`) so the per-element `hm-twinkle` keyframe can compose translate + scale + brightness. Planets get direct `transform` writes.
- **`SpectralRim`** — cursor-reactive radial-gradient ring on a child element. `mask-composite: exclude` carves out everything except the rim band. CSS-var driven, rAF-coalesced. Used by every card on `/`, `/mog`, and the settings sections.

### Scan flow

- **`Camera`** — getUserMedia camera with face-aware crop on capture. Crop bounds derive from 478-landmark bbox + padding (55% above for hair, 25% below for chin, 40% sides for ears). Clamps to ≥256 longer-edge. Output capped at 768 longer-edge (Gemini single-tile threshold). Mirrored output matches the mirrored preview.
- **`FaceDetectedPill`** — emerald pill that slides in when a face locks.
- **`Countdown`** — clamp(180px, 50vw, 360px) numerics with a spring per swap.
- **`LiveMeter`** + **`LivePageBorder`** — top-left liquid-glass score card with SVG `feDisplacementMap` backdrop warp, tier-coloured glow, score-as-bar visualisation. PageBorder paints inset linear-gradients from the tier color at each viewport edge, fading inward over 36px.
- **`SpiderwebOverlay`** — SVG line-drawing animation across MediaPipe landmark groups + IPD-normalized cross-pair measurement labels.
- **`ScoreReveal`** — count-up animation + tier-letter pop + sub-score card grid.
- **`SubScoreCard`** — count-up bar card. Fallback to "N/A" + empty bar when `fallback: true`.
- **`MoreDetail`** — expandable 30-field breakdown grouped into 5 sections (Presentation, Lower face & mouth, Eyes & brows, Mid face & nose, Skin). Token usage row when tokens passed. Locked variant behind a blur for anonymous viewers.
- **`Confetti`** — `canvas-confetti` burst from two corners; gradient palette for S-tier.
- **`RetakeButton`** — outlined retake pill.

### Modals + sheets

- **`AuthModal`** — portal-mounted sign-in dialog. OAuth + magic-link form. Greys out unconfigured providers as "soon". Post-send confirmation shows inbox shortcuts (Gmail/Outlook/Yahoo/iCloud).
- **`ConfirmModal`** — replacement for native `confirm()`/`prompt()`. Optional input with `matchPhrase` validation (e.g. type `DELETE`) or `minLength` (e.g. 6-digit 2FA code). Backdrop click + Escape + X all cancel.
- **`PrivacyModal`** — first-scan consent dialog with an affirmative-consent checkbox. Captures back-nav breadcrumb for `/terms` / `/privacy` clicks so consent state survives the side trip.
- **`BattleConsentModal`** — first-battle consent dialog (public or private). Affirmative-consent checkbox; persists to `localStorage` at `holymog-battle-consent-accepted`. Exports `BATTLE_CONSENT_KEY`, `readBattleConsent()`, and `writeBattleConsent()` so `/mog` and `/mog/battle` share the same state. Same back-nav breadcrumb pattern as PrivacyModal (id `'battle'`).
- **`BattleReportModal`** — post-match report modal, public 1v1 only. Radio reasons (cheating / minor / nudity / harassment / spam / other), optional details textarea (required only for `other`). POSTs to `/api/battle/report`. Generic "thanks" toast on success — no mention of the reported user, no hint about duplicates, no review ETA. Mounted via React portal so it's not clipped by the result-screen's gradient parents.
- **`LeaderboardModal`** — promote-to-leaderboard sheet. `include_photo` opt-in toggle with face-preview (or avatar fallback). High-score (≥ S-tier) review notice. Required scan-data acknowledgement checkbox. Previous vs new score comparison block when replacing.
- **`ShareSheet`** — bottom sheet with 8-platform icon grid (TikTok/Instagram/Snapchat/X/iMessage/WhatsApp/Discord/Reddit) + native share + copy-image + copy-link. Top-of-viewport toast portal for "Image copied" confirmations.
- **`AvatarUploader`** — `react-image-crop` circular crop with 1:1 aspect. Outputs 256×256 PNG. POSTs to `/api/account/avatar`.
- **`BannerUploader`** — sibling for 3:1 1500×500 JPEG (quality 0.92).

### Result + share

- **`MogResultScreen`** — universal end-of-battle screen used by both `/mog` and `/mog/battle`. Animated headline, vs-board with count-up cards + score bars, margin pill, ELO delta pill, action row (share + rematch/find-another + home).
- **`LeaderboardButton`** — small bouncing "add your score to the leaderboard" pill.
- **`ShareCard`** — minimal preview tile (200×360) used in development / fallback.

### Profile + lists

- **`PublicProfileView`** — banner + avatar overlap + name with NameFx wrapper + bio + meta strip + follower/following counts + social pills. MogStats sub-section: tier card (best scan photo, glow), 6-cell stat strip, ELO climb chart, recent battles pill row + entries list, collection shelf (owned frames + badges).
- **`FollowList`** — used by `/@username/followers` and `.../following`. X-style list rows with avatar (framed) + name (NameFx) + flair badge + bio + inline follow/unfollow button (optimistic + transition). IntersectionObserver sentinel for infinite scroll.
- **`Sparkline`** — inline SVG line + filled area. Auto-scales. Optional terminal dot.
- **`Countdown`** — see above.

### Tabs

- **`AccountStatsTab`** — sections: identity, multiplayer, recent battles ribbon, biggest swings (win/loss), best scan (photo + score + sub-score bars + MoreDetail), tier distribution (band chart), weakness frequency (top label highlighted in violet), most improved (when ≥10 scans).
- **`AccountHistoryTab`** — filterable battle log (type / result / opponent prefix), summary chips updated to filtered set, infinite scroll, debounced refetch on filter change.
- **`AccountSettingsTab`** — composes the per-domain sections. Owns the optimistic `updateProfile` helper + reset/remove-leaderboard/delete callbacks.
- **`AchievementToast`** — emerald-bordered top-right toast container.

---

## Cosmetic components

### Renderers (`components/customization/`)

- **`Frame`** — wraps an avatar with the registered frame component. Falls back to a plain circular wrapper when slug is null/unknown.
- **`Badge`** — text-pill renderer. Returns null on unknown slug so render sites can call unconditionally.
- **`NameFx`** — wraps display-name text with the registered component. Threads `userStats` for smart effects.
- **`ThemeAmbient`** — full-bleed background renderer (Launch 2; currently a no-op since `THEMES` is empty).

### Name fx (`components/cosmetics/name-fx/`)

10 components, one per registered slug:

- **`signed`** — handwritten signature underline drawn once on mount via SVG stroke-dashoffset animation + a flourish dot at the end.
- **`callout`** — appends `(jawline)` after the name from `userStats.weakestSubScore`. No animation.
- **`tier-prefix`** — prepends `S+` / `A` / `B-` etc. from `userStats.bestScanOverall`, colored to its tier band.
- **`streak-flame`** — appends `7🔥` from `userStats.currentStreak`.
- **`elo-king`** — appends gold superscript ELO from `userStats.elo`.
- **`holographic`** — multi-stop iridescent gradient sliding across the letters on a 6s loop (Pokémon-card-holo vibe).
- **`neon`** — saturated cyan electric outline with a stacked text-shadow + 6.4s flicker.
- **`gilded`** — gold-leaf gradient text with a shimmer band sweeping every 4s.
- **`divine`** — soft golden glow + SVG halo arc above the letters.
- **`true-adam`** — S+ cyan→purple gradient + sparkle prefix + 7s cycle.

### Shader infrastructure (`components/cosmetics/`)

- **`ShaderCanvas`** — WebGL1 wrapper with built-in uniforms, lifecycle management, context-loss handling.
- **`StaticFallback`** — reduced-motion / over-budget fallback. Three modes: `inline-ring`, `inline-square`, `fullscreen`.

### GLSL helpers (`components/cosmetics/glsl/`)

- **`noise.ts`** — 2D Simplex noise + FBM (Gustavson/McEwan port).
- **`palette.ts`** — Iñigo Quílez cyclic palette function + 5 pre-baked control vectors (rainbow, aurora, sunset, obsidian, gold).
- **`sdf.ts`** — `sdCircle`, `sdRing`, `sdSegment`, `wedgeAngle`, `bandSmooth`.

---

## Account settings sections (`components/account/settings/`)

| Section | Accent | Toggles / actions |
|---|---|---|
| `shared.tsx` | — | `Section` (Discord-flavoured glass card with SpectralRim), `SaveIndicator`, `Toggle`, `ToggleRow`, accent palette dictionary (13 colors), `useDebounced`, `useAutoIdle` |
| `ProfileSection` | sky | banner uploader, avatar uploader + remove, inline username editor (3-24 chars, lowercase, `_-`), bio (240 chars), location (60 chars), socials grid (instagram/x/snapchat/tiktok/discord), save button |
| `CustomizationSection` | emerald | owned name fx with live `userStats` preview, locked name fx with `LOCKED_PREVIEW_STATS` mock (tier S-, 7-streak, 1500 ELO, jawline weakness), equip/unequip |
| `PrivacySection` | amber | `hide_photo_from_leaderboard` (greyed out when there's no submitted photo), `hide_elo` |
| `BattleSection` | rose | `mute_battle_sfx` |
| `NotificationsSection` | orange | `weekly_digest` (Sundays 12:00 UTC), `mog_email_alerts` |
| `AccountSection` | indigo + violet + teal + fuchsia | email change (magic-link + Google re-auth paths), connected accounts (add/remove with last-method protection), active sessions (kick / kick-others), 2FA (setup with QR + backup codes / disable with code) |
| `DataSection` | cyan + red | "download my data" (JSON export); danger zone: sign out, reset stats, remove leaderboard, delete account (type `DELETE` to confirm) |
| `HelpSection` | zinc | links to /help, /terms, /privacy, mailto:bug-report; app version footer |

---

## Public assets (`public/`)

- `logo-mark.png`, `logo-wordmark.png` — brand assets.
- `og.png` — OpenGraph + Twitter card image.
- `icon-192.png`, `icon-512.png` — PWA icons.
- `apple-logo.png`, `google-logo.png` — auth-modal provider buttons.
- `icons/{tiktok,instagram,snapchat,discord,reddit,whatsapp,imessage,x}.png` — share-sheet platform tiles.
- `inbox/{gmail,outlook,yahoo,apple}.jpeg` — magic-link "check your inbox" provider shortcuts.

---

## Configuration files

- **`package.json`** — see [Stack](#stack) for the full dependency list. Scripts: `dev` (next dev), `build`, `start`, `wipe` (`node scripts/wipe-supabase.mjs`).
- **`next.config.ts`** — `rewrites` for `/@username` canonical URLs; `headers` always-on (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) + production CSP. See [Security headers + CSP](#security-headers--csp).
- **`vercel.json`** — five cron jobs.
- **`tsconfig.json`** — strict, ES2017 target, ESNext module, bundler resolution, `@/*` → `./*` path alias, includes `.mts` for the wipe script.
- **`postcss.config.mjs`** — Tailwind v4 PostCSS plugin.
- **`AGENTS.md`** / **`CLAUDE.md`** — Reminds agents that Next 16 has breaking changes from training data and to read `node_modules/next/dist/docs/` before writing routing code. `CLAUDE.md` just `@AGENTS.md` includes it.
- **`.env.example`** — every required env var, blank.
- **`.gitignore`** — node_modules, .next, .vercel, .env* (with `.env.example` re-included), .DS_Store, *.tsbuildinfo, next-env.d.ts, .claude/, CLAUDE.md, AGENTS.md.

---

## Scripts

### `scripts/wipe-supabase.mjs`

One-command full reset. Run with `npm run wipe`. In a single Postgres transaction:

1. Empties three storage buckets (`holymog-uploads`, `holymog-scans`, `holymog-cosmetics`) via the Supabase Storage REST API (a recently-added `storage.protect_delete()` trigger blocks `delete from storage.objects` even for service-role).
2. Drops every app-owned `public.*` table.
3. Re-runs the consolidated migration from `../docs/migrations/2026-05-10-pre-launch-final.sql` (sibling to the repo) — recreates tables, functions (`pair_two()`), triggers (followers count, etc.), RLS policies, storage buckets, and seeds the cosmetic catalog (10 name fx).

Safety:
- Reads `DATABASE_URL` from `.env.local` only (no env-var fallback).
- Prints the target hostname and a typed-confirmation prompt (`WIPE EVERYTHING` exact match).
- All-or-nothing — the SQL wraps its body in `begin … commit` so any failure rolls back.
- Post-flight sanity checks: counts `public.*` tables, checks all 3 storage buckets exist, counts seeded `catalog_items`.

---

## Environment variables

Every variable in `.env.example`:

### Vertex AI (Gemini)

- `VERTEX_API_KEY` — Express-mode API key (the key carries project binding internally).
- `GEMINI_MODEL` — override the model. Default `gemini-2.5-flash-lite`.
- `VERTEX_REGION` — region override. Default `us-central1`. Global endpoint adds ~10s latency, don't use.

### Database + Supabase

- `DATABASE_URL` — Postgres connection-pooler URL (port 6543 / PgBouncer). Required.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — server-side Supabase clients.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser Realtime client.

### Auth.js

- `AUTH_SECRET` — signs sessions + anonymous-id cookies + review tokens + 2FA encrypted secrets. Required. Rotating it invalidates everything.
- `AUTH_TRUST_HOST` — `true` for Auth.js behind a proxy.
- `NEXTAUTH_URL` — canonical app URL for Auth.js.
- `NEXT_PUBLIC_APP_URL` — same, exposed to the client.
- `AUTH_COOKIE_DOMAIN` — `.holymog.com` to scope the session cookie to all subdomains.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` — Google OAuth.
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` / `NEXT_PUBLIC_AUTH_APPLE_ENABLED` — Apple OAuth. Secret is a JWT generated from a `.p8` key, rotates every 6 months.
- `EMAIL_SERVER_HOST` (default `smtp.gmail.com`), `EMAIL_SERVER_PORT` (default 465), `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` (Google app password), `EMAIL_FROM` (default `auth@holymog.com`), `NEXT_PUBLIC_AUTH_EMAIL_PROVIDER` (client flag).

### LiveKit

- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` (wss endpoint).

### Upstash (rate limit + cost cap + email volume)

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### Cron + admin

- `CRON_SECRET` — Vercel Cron Authorization Bearer token. Required in production.
- `ADMIN_USER_IDS` — comma-separated user UUIDs allowed to call `/api/admin/grant`.
- `ADMIN_REVIEW_EMAIL` — destination for high-score scan review emails.
- `CONTACT_EMAIL` — destination for `/api/contact` form. Default `hello@holymog.com`.

### Cost + budget

- `DAILY_GEMINI_BUDGET_USD` — daily Gemini spend cap. Default $30.

### Stripe

- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL` — recurring price IDs.

### Misc client

- `NEXT_PUBLIC_APP_VERSION` — version string in HelpSection footer.
- `NEXT_PUBLIC_ADSENSE_CLIENT_ID` — present but unused at Launch 1.

### Kill switches (set to `1` / `true` / `yes` / `on` to engage)

- `KILL_SWITCH_SCORE`, `KILL_SWITCH_BATTLES`, `KILL_SWITCH_LEADERBOARD`, `KILL_SWITCH_SIGNUPS`.

---

## Local development

```sh
# 1. clone + install
git clone <repo>
cd holymog
npm install

# 2. copy template + fill in real values
cp .env.example .env.local
# at minimum: DATABASE_URL, VERTEX_API_KEY, SUPABASE_URL/ANON/SERVICE keys,
# AUTH_SECRET, NEXTAUTH_URL=http://localhost:3000, NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. (optional) reset the DB from the consolidated migration
npm run wipe   # asks you to type WIPE EVERYTHING

# 4. dev server
npm run dev    # http://localhost:3000
```

Local dev quirks:
- Without `UPSTASH_REDIS_REST_URL` / `_TOKEN` set, the rate limiters + cost cap + email-volume counters silently no-op (pass-through). Fine for dev.
- Without `EMAIL_SERVER_PASSWORD`, the Nodemailer provider is *not* registered server-side. The AuthModal still shows "email me a link" but surfaces an `email sign-in is not configured` error on submit.
- CSP is **skipped in dev** because HMR + react-refresh need `eval()`.
- `/api/debug-log` is dev-only — `POST` appends to `/tmp/holymog-debug.log`, `DELETE` clears it.

---

## Deployment

The project targets **Vercel** specifically:
- `vercel.json` registers 5 cron jobs at UTC schedules.
- Vercel signs cron requests with `Authorization: Bearer ${CRON_SECRET}`.
- Edge runtime is **not** used — every route is `runtime = 'nodejs'` for the `pg` driver + `sharp` + `crypto`.
- Connection pool (`max: 5`) is sized for Vercel serverless cold starts against the Supabase PgBouncer at port 6543.

Standard flow:
1. Link the project to Vercel.
2. Set every env var from `.env.example` in the project settings (Production + Preview + Development as appropriate).
3. Push to `main`. Vercel auto-deploys.

For local dev with Supabase Realtime working, `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` must match the project the rest of the app is talking to.

---

## Database wipe + reset

`npm run wipe` — see [Scripts](#scripts). The consolidated migration lives in `../docs/migrations/2026-05-10-pre-launch-final.sql` (sibling to the repo, not committed to the public source tree). The wipe script looks there first; falls back to `./docs/migrations/` for older checkouts that still have the folder inline.

Tables created by the consolidated migration (inferred from the API routes that touch them):

- **`users`** (Auth.js adapter): `id`, `name`, `email`, `"emailVerified"`, `image`.
- **`accounts`** (Auth.js adapter): OAuth provider links.
- **`sessions`** (Auth.js adapter): `sessionToken`, `userId`, `expires`.
- **`verificationTokens`** (Auth.js adapter): for magic-link flow.
- **`profiles`**: `user_id` (PK), `display_name`, `previous_usernames[]`, `bio`, `location`, `banner_url`, `socials` jsonb, `elo`, `peak_elo`, `matches_played`, `matches_won`, `matches_tied`, `current_streak`, `longest_streak`, `best_scan_overall`, `best_scan` jsonb, `improvement_counts` jsonb, `equipped_frame`, `equipped_theme`, `equipped_flair`, `equipped_name_fx`, `hide_photo_from_leaderboard`, `hide_elo`, `mute_battle_sfx`, `weekly_digest`, `mog_email_alerts`, `two_factor_enabled`, `two_factor_secret`, `two_factor_backup_codes[]`, `subscription_status`, `subscription_tier`, `subscription_started_at`, `subscription_current_period_end`, `monthly_cosmetic_claimed_at`, `stripe_subscription_id`, `followers_count`, `following_count`, **`banned_at`**, **`banned_reason`**, `created_at`, `updated_at`.
- **`leaderboard`**: `id`, `user_id`, `name`, `overall`, `tier`, `jawline`, `eyes`, `skin`, `cheekbones`, `image_url`, `image_path`, `avatar_url`, `created_at`.
- **`scan_history`**: `id` (UUID), `user_id`, `overall`, `jawline`, `eyes`, `skin`, `cheekbones`, `presentation`, `vision` jsonb, `image_path`, `requires_review`, `created_at`.
- **`scan_attempts`**: `id`, `user_id`, `anon_id`, `ip_hash`, `created_at` — quota telemetry.
- **`pending_leaderboard_submissions`**: `user_id` (PK), `scores` jsonb, `vision` jsonb, `created_at` — 1h TTL, the anti-cheat anchor.
- **`battles`**: `id`, `kind` ('public'/'private'), `code`, `host_user_id`, `livekit_room`, `state` (lobby/starting/active/finished/abandoned), `started_at`, `finished_at`, `max_participants`, `created_at`.
- **`battle_participants`**: `id`, `battle_id`, `user_id`, `display_name`, `peak_score`, `final_score`, `is_winner`, `joined_at`, `left_at`, **`peak_image_path`** (path into `holymog-battles` storage; written by `/api/battle/score` when a call beats the prior peak).
- **`matchmaking_queue`**: `user_id` (PK), `display_name`, `created_at`. The `pair_two()` function pairs the two oldest waiters.
- **`elo_history`**: `user_id`, `elo`, `delta`, `battle_id`, `recorded_at`.
- **`email_preferences`**: `user_id` (PK), `weekly_digest`, `mog_alerts`, `battle_invites`, `last_digest_sent_at`.
- **`catalog_items`**: `slug` (PK), `kind`, `name`, `description`, `price_cents`, `subscriber_only`, `sort_order`, `active`.
- **`user_inventory`**: `id`, `user_id`, `item_slug`, `source` ('purchase'/'grant'/'reward'/'achievement'/'subscription_credit'), `stripe_payment_intent`, `purchased_at`, `subscription_credit_redeemed_at`. UNIQUE on `(user_id, item_slug)`.
- **`achievement_progress`**: `user_id`, `achievement_key`, `progress`, `achieved_at`. UNIQUE on `(user_id, achievement_key)`.
- **`stripe_purchases`**: `id`, `user_id`, `stripe_session_id` (UNIQUE), `stripe_payment_intent`, `amount_cents`, `status`, `items_jsonb`, `created_at`.
- **`audit_log`**: `id`, `user_id` (FK ON DELETE SET NULL), `action`, `resource`, `metadata` jsonb, `ip_hash`, `user_agent`, `created_at`.
- **`follows`**: `follower_user_id`, `followed_user_id`, `created_at`. CHECK constraint prevents self-follow. Triggers maintain `profiles.followers_count` / `following_count`.
- **`battle_reports`**: `id` (UUID), `battle_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `reason` (text, one of the enum in `lib/schemas/report.ts`), `details` (text, ≤ 1000 chars, nullable), `state` (text: `'pending'` / `'banned'` / `'dismissed'`, default `'pending'`), `resolved_at` (timestamptz, nullable), `resolved_by_action` (text, nullable), `created_at` (timestamptz, default `now()`). UNIQUE on `(battle_id, reporter_user_id, reported_user_id)`. Indexed on `(state, created_at)` for admin queue scans.

---

## Notable conventions and "watch-outs"

- **App Router only** — every route is server-or-client per-file, no `pages/`. Dynamic segments use `params: Promise<{ … }>` (Next 16 signature).
- **Tier letters MUST render uppercase** even though `body` is globally lowercased via `text-transform: lowercase`. Every tier render site explicitly applies `textTransform: 'uppercase'` (defense-in-depth alongside the `uppercase` Tailwind utility).
- **Anti-cheat leaderboard** — clients never send scores. The only path onto the board is via `pending_leaderboard_submissions`, which only `/api/score` writes. Forging a score is mathematically impossible.
- **RLS != Auth.js** — Supabase RLS policies are written against `auth.uid()` which Auth.js sessions never set. Anywhere we'd want to use the anon-key REST or Realtime postgres_changes path, we instead route through a backend route that uses the service-role client and applies our own auth check (sample: `/api/battle/[id]/state`, `/api/battle/[id]/participants`, `/api/battle/queue/status`).
- **Origin guard is the cheap first line, budget cap is the hard ceiling** — a determined attacker with a custom backend can spoof `Origin`. The daily Gemini USD cap is what stops them from burning unbounded cost.
- **2FA enrolment-only** — sign-in does not currently challenge for a TOTP code; the surfaces all work end-to-end but the sign-in gate is the missing piece.
- **Stripe / store deferred** — `/account/store/*` redirects to `/account` at Launch 1. The webhook + checkout-session + subscription-state plumbing is fully wired so Launch 2 can flip the storefront on.
- **Frames, badges, themes deferred** — `FRAMES`, `BADGES`, `THEMES` maps in `lib/customization.ts` are intentionally empty. The slots stay wired in the schema, API, and renderers so designer assets plug in without a migration.
- **Battles publish video, never audio** — `audio={false}` on the `LiveKitRoom`. Deliberate: face-rating, not Zoom, and audio adds zero gameplay value while introducing meaningful safety surface (under-13 voice exposure, harassment).
- **Pre-fire on battle scoring** — the first `/api/battle/score` call fires 2s BEFORE `started_at` so the response lands when the active window opens. The `/api/battle/score` server-side window check accommodates this with `elapsedMs ∈ [-3000, 11000]`.
- **localStorage breadcrumb for legal pages** — `lib/back-nav.ts` lets `/terms` and `/privacy` route the user back to whichever modal they came from with full state preserved (consent boxes still checked, email half-typed, etc.).
- **Wipe script lives outside the repo** — the consolidated SQL migration is at `../docs/migrations/2026-05-10-pre-launch-final.sql` (sibling to the repo, not in the public source tree). `npm run wipe` looks there first and falls back to `./docs/migrations/` for older checkouts.
- **Audit failures must never block the calling request** — `recordAudit` swallows all errors. The application keeps working if Postgres is down for audit only.
- **Achievement firing on `/api/score` adds +1 to the count** — `persistScanHistory` is fire-and-forget and its row may not be committed before the count query runs. The +1 represents the scan that just completed; `tryGrant` is idempotent on `(user_id, achievement_key)` so duplicate calls are no-ops.
- **Lowercase everywhere** — `body { text-transform: lowercase }` globally. Tier letters and explicit "ALL CAPS" headlines override with `textTransform: 'uppercase'` + the `uppercase` utility.
- **Reports are dedupe-silent** — re-submitting against the same opponent for the same battle is a UNIQUE-violation no-op. We DON'T tell the reporter that a previous report existed (avoids a feedback channel for stalkers probing whether a target has been re-reported). The server returns the same generic `200 { ok: true }` either way.
- **Battle peak frame is saved on EVERY battle**, not just reports — public and private both. The in-app report surface is public-only, but private-party complaints emailed to `hello@holymog.com` can still pull the saved frame for review. See `app/api/battle/score/route.ts:isNewPeak` and the new `holymog-battles` bucket. Path is stable per `(battleId, userId)`, so re-peak overwrites in place. Path retention is up to 1 year per the privacy policy (longer when tied to an open report).

---

© 2026 holymog
