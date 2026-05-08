# holymog

AI-powered face rating. Look at the camera, get an F‑ to S+ tier and a 0–100 overall score with sub-breakdowns. Built as a single-page experience that fuses on-device face detection (MediaPipe) with multi-call xAI Grok vision scoring.

> "rate yourself F- to S+. mogging or getting mogged?"

> **Phase 0 in progress (2026-05-07).** Adding accounts (Google + Apple + Microsoft OAuth + email magic link) plus account-tagged leaderboard. Auth runs through **Auth.js v5**; Supabase is now used only as managed Postgres + Storage (no Auth, no RLS). **Production URL is currently `https://holymog.vercel.app`** while `holymog.com` works through Vercel's Hobby commercial-use enforcement and Barracuda category review. Once both clear, we flip the canonical URL back to `www.holymog.com` with auth on `auth.holymog.com`. **Breaking change** to the `leaderboard` table: the legacy 8-char Crockford key system is fully removed, rows are tagged by `user_id`, and submitting requires sign-in. Existing leaderboard rows are wiped during the Phase 0 deploy. See `docs/superpowers/specs/2026-05-07-mog-battles-and-accounts-design.md` for the full design.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Stack](#stack)
3. [Project layout](#project-layout)
4. [How a single scan works](#how-a-single-scan-works)
5. [Scoring pipeline](#scoring-pipeline)
6. [Tier system](#tier-system)
7. [App routes](#app-routes)
8. [API routes](#api-routes)
9. [State machine](#state-machine)
10. [Components](#components)
11. [Hooks](#hooks)
12. [Libraries](#libraries)
13. [Environment variables](#environment-variables)
14. [Optional infrastructure](#optional-infrastructure)
15. [Running locally](#running-locally)
16. [Build & deploy](#build--deploy)
17. [Privacy](#privacy)
18. [Leaderboard accounts (8-char keys)](#leaderboard-accounts-8-char-keys)
19. [Notes for future contributors](#notes-for-future-contributors)

---

## What it does

The user lands on `/`, grants camera access, sees a privacy modal once, then aims a phone or webcam at their face. As soon as the face is held steady the experience runs a tightly-choreographed 8-second sequence:

- **3-second countdown** with the camera live.
- **5-second "scan phase"** during which a wireframe spiderweb overlay traces the face, a small "live scan" meter (top-left) cycles through ~10 score updates, the four screen edges glow with a tier-coloured halo, and two clean frames are quietly captured for the heavy breakdown call.
- **Mapping** waits for the heavy multi-prompt Grok call to resolve (~1.5 s typical).
- **Reveal** animates the tier letter, the overall number counts up, sub-scores fill, confetti fires.
- **Complete** lets the user share to TikTok / Instagram / Snapchat / X / Discord, copy the share image, post to a public leaderboard (with an opt-in 8-char "account key" so they can edit/replace their entry across devices without creating a real account), retake, or expand a "more detail" panel showing all 30 underlying vision fields plus token-usage / cost breakdown.

The public **`/leaderboard`** is paginated and infinite-scrolling: the first 100 rows are warm-cached the moment the user's scan completes (so opening the page is instant), and pages 2, 3, 4… are fetched lazily as the user scrolls.

---

## Stack

- **Framework** — [Next.js 16.2](https://nextjs.org) (App Router) on **React 19.2**
- **Language** — TypeScript (strict)
- **Styling** — Tailwind CSS v4 (zero-config, via `@tailwindcss/postcss`)
- **Animation** — Framer Motion v12
- **Face detection (client)** — `@mediapipe/tasks-vision` FaceLandmarker (478 landmarks, GPU delegate)
- **Vision scoring (server)** — xAI Grok 4.20 non-reasoning, called via OpenAI-style chat completions
- **Leaderboard** — Supabase (Postgres + Storage)
- **Rate limiting** — Upstash Ratelimit + Redis
- **Sharing** — Web Share API w/ image fallback, `canvas-confetti`, native canvas-rendered share PNG
- **Icons** — `lucide-react` + custom social SVGs in `public/icons/`

> Heads-up: this is **Next.js 16**, not the Next.js most older docs (or LLMs) describe. APIs and conventions may differ — when in doubt, check `node_modules/next/dist/docs/` for the version actually installed.

---

## Project layout

```
holymog/
├── app/
│   ├── api/
│   │   ├── account/[key]/route.ts    GET: account lookup by 8-char key (cross-device prefill)
│   │   ├── debug-log/route.ts        POST/DELETE: appends to /tmp/holymog-debug.log
│   │   ├── leaderboard/route.ts      GET: paginated top scores · POST: insert OR update by key
│   │   ├── quick-score/route.ts      Single-image low-detail Grok call (live meter)
│   │   └── score/route.ts            Multi-image breakdown Grok call (final score)
│   ├── leaderboard/page.tsx          Public leaderboard list (infinite scroll)
│   ├── globals.css                   Tailwind import, font tokens, keyframes
│   ├── layout.tsx                    Root layout, fonts, metadata, viewport
│   └── page.tsx                      Main scan flow orchestrator
├── components/
│   ├── AccountKeyCard.tsx            One-shot post-success card: copy + download .txt
│   ├── Camera.tsx                    getUserMedia + face-cropped frame capture
│   ├── Confetti.tsx                  canvas-confetti wrapper
│   ├── Countdown.tsx                 3-2-1 numeric countdown
│   ├── FaceDetectedPill.tsx          "Face Detected!" pill
│   ├── LeaderboardButton.tsx         CTA on the results screen
│   ├── LeaderboardModal.tsx          Submit-to-leaderboard form, account-key aware
│   ├── LiveMeter.tsx                 Liquid-glass live score widget + page-border halo
│   ├── MoreDetail.tsx                Expandable panel: all 30 vision fields + tokens/cost
│   ├── PrivacyModal.tsx              First-visit consent gate
│   ├── RetakeButton.tsx              Retake CTA
│   ├── ScoreReveal.tsx               Tier-letter reveal + count-up animation
│   ├── ShareCard.tsx                 (Currently unused) static React tier card
│   ├── ShareSheet.tsx                Bottom-sheet share UI
│   ├── SpiderwebOverlay.tsx          Animated SVG wireframe over the face
│   └── SubScoreCard.tsx              Animated sub-score tile w/ progress bar
├── hooks/
│   ├── useAccount.ts                 localStorage trio (key/name/photo-pref/overall) + fetchAccount
│   ├── useFaceDetection.ts           rAF-driven FaceLandmarker loop
│   ├── useFlowMachine.ts             useReducer state machine
│   └── useShare.ts                   Native-share / clipboard / Twitter intent helpers
├── lib/
│   ├── account.ts                    Crockford 8-char key generation + validation helpers
│   ├── faceLandmarker.ts             MediaPipe FaceLandmarker singleton (lazy)
│   ├── leaderboardCache.ts           sessionStorage cache for prefetched page 1
│   ├── ratelimit.ts                  Upstash sliding-window limiter (10/min/IP)
│   ├── scoreColor.ts                 0..100 → tier-banded HSL string
│   ├── scoreEngine.ts                vision → FinalScores composite
│   ├── shareImageGenerator.ts        1080×1920 share PNG via canvas
│   ├── supabase.ts                   Cached SupabaseClient + types
│   ├── tier.ts                       0..100 → 18 tier letters + descriptors
│   └── vision.ts                     Grok prompts, callGrok, analyze{Face,Faces,Quick}
├── public/
│   ├── icons/{tiktok,instagram,snapchat,x,discord}.svg
│   └── og.svg                        Open Graph image
├── types/index.ts                    Landmark, SubScores, VisionScore, FinalScores, FlowState…
├── next.config.ts                    Empty (defaults)
├── tsconfig.json                     paths: { "@/*": ["./*"] }
├── postcss.config.mjs                @tailwindcss/postcss
└── package.json                      next dev / build / start
```

---

## How a single scan works

Defined at the top of [`app/page.tsx`](app/page.tsx) and choreographed through the `useFlowMachine` reducer.

```
t=0 ms     state → 'detected', Countdown mounts (3 → 2 → 1)
t=2000 ms  /api/quick-score call 1 fires (warmup; result lands ~3000)
t=3000 ms  Countdown unmounts, scanPhase = true
            → LiveMeter (top-left) shows the warmup score
            → LivePageBorder fades in tier-coloured edges
            → SpiderwebOverlay starts tracing
t=3000..7500   Real calls every 1000 ms (5 total) + synthetic
                jitter updates 500 ms after each = 10 visible
                updates anchored on the most-recent real score
t=4500 ms  Capture frame 1 (cropped to face, w/ landmarks) for /api/score
t=6500 ms  Capture frame 2
t=8000 ms  CAPTURE dispatched → state 'mapping'
            Heavy /api/score fires with both frames in parallel
            (3 prompts × 2 frames = 6 Grok calls, parallel ≈ ~1.5 s)
mapping done → MAPPING_DONE → state 'revealing'
            ScoreReveal: tier letter springs in, overall counts up,
            sub-scores stagger, confetti fires
t=reveal+3s  REVEAL_DONE → state 'complete'
            Action row (Retake / Share / Add to leaderboard) appears,
            "more detail" expands the full 30-field breakdown.
```

The choreography is intentional: the warmup call lands exactly when the countdown disappears, so the live meter never flashes empty, and the spiderweb finishes its trace right as `/api/score` is wrapping up.

---

## Scoring pipeline

The pipeline is defined in [`lib/vision.ts`](lib/vision.ts) and [`lib/scoreEngine.ts`](lib/scoreEngine.ts).

### Two endpoints, very different shapes

| Endpoint            | Detail   | Image count | Prompts/image | Purpose                                     |
| ------------------- | -------- | ----------- | ------------- | ------------------------------------------- |
| `/api/quick-score`  | `low`    | 1           | 1             | Cheap live-meter calls (10/scan visually)   |
| `/api/score`        | `high`   | 2           | 3             | Authoritative 30-field breakdown            |

### The 30 vision fields

Grok is asked **three category prompts in parallel per frame**, each returning ~9–11 integer scores. Categories live in `STRUCTURE_KEYS`, `FEATURES_KEYS`, `SURFACE_KEYS` and together populate the `VisionScore` type:

- **Structure (9):** `jawline_definition`, `chin_definition`, `cheekbone_prominence`, `nose_shape`, `nose_proportion`, `forehead_proportion`, `temple_hollow`, `ear_shape`, `facial_thirds_visual`
- **Features (10):** `eye_size`, `eye_shape`, `eye_bags`, `canthal_tilt`, `iris_appeal`, `brow_shape`, `brow_thickness`, `lip_shape`, `lip_proportion`, `philtrum`
- **Surface (11):** `skin_clarity`, `skin_evenness`, `skin_tone`, `hair_quality`, `hair_styling`, `posture`, `confidence`, `masculinity_femininity`, `symmetry`, `feature_harmony`, `overall_attractiveness`

Each prompt embeds the same calibration rubric (`ANCHOR_RUBRIC`) that pegs the 0–100 scale to a "rank against 1000 random adults" mental model with explicit guidance on smiles, lighting, partial occlusion, and **deliberate** distortion (forced into the 5–25 band).

If a category fails to parse, `validateCategory` falls back to a strict-prefix retry, then to neutral 50s with `fallback: true` set on the response. Multi-frame calls (`analyzeFaces`) average each field across frames and merge the `fallback` flag.

### From VisionScore → FinalScores

`combineScores(vision)` collapses the 30 raw fields into the four user-facing sub-scores plus a fifth "presentation" composite:

| Sub-score    | Inputs (averaged)                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `jawline`    | `jawline_definition`, `chin_definition`, `lip_shape`                                                                                        |
| `eyes`       | `eye_size`, `eye_shape`, `eye_bags`, `canthal_tilt`, `iris_appeal`, `brow_shape`, `brow_thickness`                                          |
| `skin`       | `skin_clarity`, `skin_evenness`, `skin_tone`                                                                                                |
| `cheekbones` | `cheekbone_prominence`, `nose_shape`, `nose_proportion`, `forehead_proportion`, `temple_hollow`, `ear_shape`, `philtrum`, `facial_thirds_visual` |
| `presentation` | `hair_quality`, `hair_styling`, `posture`, `confidence`, `masculinity_femininity`, `symmetry`, `feature_harmony`, `overall_attractiveness`, `lip_proportion` |

The overall score blends a weighted mean of the five composites with Grok's holistic judgement:

```ts
subOverall    = 0.25·jawline + 0.20·eyes + 0.20·skin + 0.15·cheekbones + 0.20·presentation
finalOverall  = 0.40·subOverall + 0.60·overall_attractiveness
```

The 60-weighted holistic field is intentional: per-region averages tend to drift down because every weak field counts equally, and only the holistic field reliably catches "this person is at model tier".

### Quick-score (live meter)

`analyzeQuick` calls Grok with a one-line prompt asking for `{ "overall": <int> }` only, using `detail: 'low'` to keep input tokens small. The result is treated as a single observation and merged with synthetic ±1–5 jitter to produce 10 visible updates per scan from only 5 real API calls.

---

## Tier system

Defined in [`lib/tier.ts`](lib/tier.ts) and [`lib/scoreColor.ts`](lib/scoreColor.ts). 18 tiers, six colour bands.

| Score   | Letters         | Colour                                               | Descriptor (S+ only example) |
| ------- | --------------- | ---------------------------------------------------- | ---------------------------- |
| 0–25    | F-, F, F+       | Red `#ef4444`                                        | "ugly af" / "subhuman" / "chopped" |
| 26–40   | D-, D, D+       | Orange `#f97316`                                     | "low-tier normie"            |
| 41–55   | C-, C, C+       | Yellow `#eab308`                                     | "normie"                     |
| 56–70   | B-, B, B+       | Lime `#84cc16`                                       | "high-tier normie"           |
| 71–86   | A-, A, A+       | Green `#22c55e`                                      | "chadlite" / "mogger"        |
| 87–100  | S-, S, S+       | Cyan→Purple gradient (`#22d3ee → #a855f7`), S+ glows | "chad" / "heartbreaker" / "brian" |

Within each band `getScoreColor(value)` interpolates HSL hue/saturation/lightness so a 71 reads slightly different from an 86 even though both are tier "A". Used everywhere — sub-score bars, live meter digits, page-border halo, leaderboard score column.

---

## App routes

- **`/`** — `app/page.tsx`. The whole experience. Hydrates from `localStorage` if a previous result exists; otherwise mounts the camera, runs the scan, persists the final result. All client-side; no SSR data.
- **`/leaderboard`** — `app/leaderboard/page.tsx`. Hydrates page 1 instantly from a sessionStorage cache (warmed when the scan transitions to `complete`), then silently re-fetches `/api/leaderboard?page=1` to refresh. An IntersectionObserver on a sentinel near the bottom triggers `?page=2`, `?page=3`, … as the user scrolls — 100 rows per page, lazily loaded.

---

## API routes

All routes are `runtime: 'nodejs'`, `dynamic: 'force-dynamic'`.

### `POST /api/quick-score`

- Body: `{ imageBase64: string }`
- Validates: payload < 2 MB, decodable PNG/JPEG.
- **Not rate-limited** (10 calls per scan is the point).
- Calls `analyzeQuick` (single low-detail Grok call) and returns `{ overall: number }` plus `X-Tokens-Input` / `X-Tokens-Output` headers.
- Returns `503 vision_unavailable` if `XAI_API_KEY` is unset.

### `POST /api/score`

- Body: `{ images: string[] }` (1–6 base64 frames, each < 2 MB) or `{ imageBase64: string }`.
- Validates byte size, magic bytes (PNG/JPEG), dimensions (256–2048 px on each side).
- Rate-limited per IP via `getRatelimit()` (10/min sliding) when Upstash env is configured.
- Calls `analyzeFaces` (3 prompts × N frames, all parallel; fields averaged across frames).
- Returns the full `VisionScore` JSON plus `X-Tokens-Input` / `X-Tokens-Output` headers.

### `GET /api/leaderboard` and `POST /api/leaderboard`

- `GET ?page=N` (default 1) returns `{ entries: LeaderboardRow[], hasMore: boolean, page: number }`. 100 rows per page, ordered by `overall` descending. Returns `{ entries: [], hasMore: false, error: 'unconfigured' }` if Supabase env is unset.
- `POST` body: `{ name: string (1..24), scores: FinalScores, imageBase64?: string, key?: string }`.
  - Rate-limited (`lb:` prefix on the key).
  - Validates scores and normalises whitespace.
  - **No `key`:** server generates a fresh 8-char Crockford key, inserts a new row (retrying on the vanishingly rare unique-violation), and returns `{ entry, key, isNew: true }`.
  - **With `key`:** server normalises + validates the key, looks up the row, and `UPDATE`s it in place (preserving `id` and `created_at`). Returns `{ entry, key, isNew: false }` or `404 key_not_found` if the key isn't on file.
  - Photo handling on either path: a non-empty `imageBase64` data URL is uploaded to the `holymog-faces` Supabase Storage bucket under a UUID path; both `image_url` and `image_path` are persisted on the row. On `UPDATE`, any old photo on the row is best-effort deleted from storage.

### `GET /api/account/[key]`

Used by the "I have a key from another device" flow to prefill the submit modal without forcing the user to retype anything.

- Path param: 8-char Crockford key. Auto-uppercased, format-validated.
- Rate-limited under the `acct:` bucket (separate from `lb:`).
- Returns `{ name, overall, tier, sub: { jawline, eyes, skin, cheekbones }, hasPhoto, imageUrl }` on hit, or `404 not_found` if the key has no entry.
- Returns the public photo URL — same data already exposed via the leaderboard list, no extra leak.

### `POST /api/debug-log`, `DELETE /api/debug-log`

- Local-only diagnostic. `POST` appends one JSON-line entry (with `ts` ISO timestamp) to `/tmp/holymog-debug.log`. `DELETE` truncates it. Used by `/` to log every final scan locally for offline review.

---

## State machine

`hooks/useFlowMachine.ts` is a `useReducer` with these states:

```
idle ──CAMERA_READY──▶ streaming ──FACE_STABLE──▶ detected
                            ▲                        │
                            │                  CAPTURE (frames)
                            │                        ▼
                            │                     mapping ──MAPPING_DONE──▶ revealing
                            │                                                    │
                            │                                            REVEAL_DONE
                            │                                                    ▼
                            └──────────────RETAKE──────────────────────── complete
                                                          (HYDRATE jumps idle→complete)
ERROR can transition from any state to: error
```

Notable transitions:
- `FACE_LOST` only fires while in `detected`, dropping back to `streaming` (cancels the in-flight scan).
- `CAPTURE` rejects empty-frames payloads to avoid stranding the user in `mapping`.
- `HYDRATE` is fired once on first mount if `localStorage["holymog-last-result"]` has a valid `{ scores, capturedImage }` payload — lets returning users re-see their tier without rescanning.

---

## Components

> All client components (`'use client'`). The codebase is pure-client; the only server code is the API route handlers.

- **`AccountKeyCard`** — One-shot card shown inside `LeaderboardModal` when the server returns `isNew: true` on a first-time submission. Displays the freshly-issued 8-char key in a big monospace block plus **Copy** and **Download** (`.txt`) buttons. After the user clicks **Done** the modal closes; the key is persisted to localStorage so subsequent submits are silent updates.
- **`Camera`** — `getUserMedia` w/ portrait/landscape-aware constraints, `facingMode: 'user'`. Forwards a `CameraHandle.capture(landmarks?)` imperative method that draws the current video frame to a canvas and returns a JPEG data URL. When landmarks are passed it computes a face-centred crop (with extra hair / ear / chin padding) so vision calls receive only the face — and clamps every dimension to ≥ `MIN_DIM=256` so `/api/score` validation can't fail. The capture is **mirrored at draw time** (the canvas is `translate`d + `scale(-1, 1)`'d before `drawImage`) so the saved bytes match what the user just saw on the mirrored camera preview. No display surface needs a CSS flip as a result.
- **`Confetti`** — Two simultaneous bottom-corner bursts via `canvas-confetti`. Colour set switches to a cyan/purple palette for S-tier gradients.
- **`Countdown`** — Big spring-bounced 3 / 2 / 1 numerals; rAF-driven so it stays accurate under tab throttling. ARIA live region.
- **`FaceDetectedPill`** — Top-centre emerald pill that drops in when `state.type === 'detected'`.
- **`LeaderboardButton`** — Subtle outlined CTA, accent-coloured to match the user's tier.
- **`LeaderboardModal`** — Dialog for adding to / updating an entry on the public leaderboard, with full account-key flow. Three substates:
  - **No key** (first-time submit on this device): clean form + a small "have a key from another device?" link that opens an inline paste row.
  - **Stored key**: a "linked to your account · ABCD••••" chip up top, name + photo checkbox prefilled from localStorage, a side-by-side **Previous vs This scan** comparison block (rendered instantly from cached overall, reconciled with the server in the background), and a context-aware submit label (`Replace` if the new score ≥ old, `Replace anyway` if lower).
  - **Paste key**: a small key-input row that auto-uppercases and fetches `/api/account/[key]` on the 8th character. On hit, transitions to the stored-key UI; on miss, shows an inline error.
  
  The name input auto-lowercases and shows a brief animated `B → b` chip when an uppercase letter is intercepted, so users don't suspect a broken keyboard. Successful first-time submission swaps the modal contents for `AccountKeyCard` with the freshly issued key. Successful subsequent submission auto-closes after a short success state. All submits invalidate the leaderboard sessionStorage cache so the next visit re-fetches.
- **`LiveMeter`** — Top-left "live scan" readout. Apple-style **liquid glass** look: `feDisplacementMap` warps the camera backdrop, plus heavy `backdrop-blur` + `saturate` + `brightness < 1`, multiple inset highlights/shadows, top rim-light crescent, edge lensing radial. Big glowing tier-coloured digit, "/ 10" suffix, descriptor word, `n/total` progress, and a thin colour bar at the bottom representing position on the 0–100 scale.
- **`LivePageBorder`** — Four full-bleed gradient bands (top/bottom/left/right) that fade from solid tier colour at the edge to transparent inward. Lives alongside the live meter during scan + mapping.
- **`MoreDetail`** — Collapsible panel with five sections (Presentation, Lower face & mouth, Eyes & brows, Mid face & nose, Skin) listing every one of the 30 vision fields and their colour-coded score. Also renders a "Token usage (this scan)" card calculating dollar cost from Grok 4.20's `$1.25 / 1M input` and `$2.50 / 1M output` pricing.
- **`PrivacyModal`** — One-time consent dialog explaining: (a) photos go to xAI then are discarded, (b) shared posts only contain the tier letter, (c) leaderboard saves name + scores publicly, photo only if opted in. Acknowledged state stored in `localStorage["holymog-privacy-acknowledged"]`.
- **`RetakeButton`** — Outlined 50/50 sibling to the Share button.
- **`ScoreReveal`** — On state `revealing`: avatar (mirrored to match what the user just saw on camera), giant tier letter springing in, overall number cubic-easing to its target over 2 s, a 3 s bounce kicker, sub-score cards staggered in. Confetti fires once on mount.
- **`ShareCard`** — A small static card alternative (currently not rendered anywhere — the canvas-rendered `lib/shareImageGenerator.ts` is what actually ships out).
- **`ShareSheet`** — Bottom sheet with optional native share button + 5 platform buttons (TikTok / IG / Snapchat / X / Discord) + Copy Image / Copy Link. The platform buttons all copy the rendered share PNG to the clipboard (with a "paste in {platform}" toast); X opens a Twitter intent in a new tab. Uses `useShare(score)`.
- **`SpiderwebOverlay`** — SVG wireframe drawn from the live MediaPipe landmarks. Eight ordered groups (face outline → eyes & brows → nose → lips → jaw) animate in over 5 seconds with stroke-dash reveal, vertex dots fade in mid-animation, and at the tail a series of "cross-pair" measurements (interpupillary, ala-to-ala, lip corners, glabella-to-chin, eye corners) draw with `xx pt` callouts scaled by the IPD. Object-cover correction is computed manually so SVG coordinates align with the cropped video.
- **`SubScoreCard`** — Tile with label, big tabular-num value, animated count-up on first reveal, and a coloured progress bar that hue-shifts to match the score colour band as the digit rises.

---

## Hooks

- **`useAccount()`** — Reads four localStorage keys (`holymog-account-{key,name,photo-pref,overall}`) **synchronously** via `useState` lazy initializers, so consumers never have to wait an effect tick to render UI keyed on stored values. Exposes `storedKey`, `storedName`, `storedPhotoPref`, `storedOverall`, plus `saveAccount({ key, name, photoPref, overall })` and `clearAccount()`. Also re-exports a top-level `fetchAccount(key)` helper that wraps `GET /api/account/[key]` with proper 404 / error handling.
- **`useFlowMachine()`** — Wraps `useReducer` with the typed `FlowAction` / `FlowState` from `types/index.ts`.
- **`useFaceDetection(videoRef, enabled)`** — Lazy-loads the FaceLandmarker on first call, runs a `requestAnimationFrame` loop, and reports `{ isDetected, multipleFaces, landmarks }`. Detection requires `STABLE_FRAMES_REQUIRED = 3` consecutive single-face frames before flipping `isDetected` true (kills false positives from briefly-occluded frames). Skips every other frame to halve CPU. Bails out cleanly if the model fails to load.
- **`useShare(score)`** — Returns `nativeShare`, `shareToTwitter`, `copyImage`, `copyImageFor(platform)`, `copyLink`, and a 2.2 s auto-dismiss `toast`. Lazily generates the share PNG once, caches the `Blob`, and reuses it for every share path. Tier-aware copy (`getShareText`) varies between rage-tweet, "mid", "🔥", and "👑 genetically mogging y'all".

---

## Libraries

- **`lib/account.ts`** — Crockford-uppercase 8-char key alphabet (32 chars: `[A-HJKMNPQRSTVWXYZ0-9]` minus I/L/O/U) shared between server and client. Exports `generateAccountKey()` (32-byte secure random source via `crypto.randomBytes`, uniform modulo since 256 mod 32 = 0), `normaliseAccountKey()` (uppercase + strip whitespace/dashes), `isValidAccountKey()`, and the `ACCOUNT_KEY_REGEX`.
- **`lib/faceLandmarker.ts`** — Lazy singleton `Promise<FaceLandmarker>` using `runningMode: 'VIDEO'`, GPU delegate, `numFaces: 1`. Model + WASM loaded from Google CDN.
- **`lib/leaderboardCache.ts`** — sessionStorage cache for the prefetched first page of the leaderboard, keyed at `holymog-leaderboard-cache-v1` with a 5-minute TTL. Exports `readLeaderboardCache()`, `writeLeaderboardCache()`, `clearLeaderboardCache()`, plus `prefetchLeaderboard()` which is fired from `app/page.tsx` the moment the scan transitions to `complete`.
- **`lib/ratelimit.ts`** — Returns a `Ratelimit` (sliding-window 10/minute) keyed off Upstash env. Returns `null` if env missing — the API routes treat that as "no rate limit", letting local dev work without infra.
- **`lib/scoreColor.ts`** — `getScoreColor(value: number) => string`. Banded HSL: each tier band has its own hue family with a small smooth gradient inside the band so adjacent scores read distinguishably.
- **`lib/scoreEngine.ts`** — `combineScores(vision)`, `computePresentation(vision)`, plus `mockVisionScore()` for the fallback path when `/api/score` errors out.
- **`lib/shareImageGenerator.ts`** — Renders a 1080×1920 PNG via `<canvas>`: black bg, tier-coloured radial glow, "holymog" wordmark up top, giant tier letter centred (with cyan→purple linear gradient + 40-px glow shadow on S-tiers), and "rate yours at holymog.com" at the bottom. Returned as a `Blob` ready for the Share API or clipboard.
- **`lib/supabase.ts`** — Cached `SupabaseClient` (`persistSession: false`) plus the `LeaderboardRow` type and `FACES_BUCKET = 'holymog-faces'` constant. Returns `null` when `SUPABASE_URL` / `SUPABASE_ANON_KEY` are missing.
- **`lib/tier.ts`** — `TIERS` table (18 rows × `{ letter, min, max, color, isGradient, glow }`), `getTier(score)`, `TIER_COLOR_TOKEN`, and the `DESCRIPTORS` map (e.g. S+ → "brian").
- **`lib/vision.ts`** — Grok integration. `XAI_ENDPOINT = https://api.x.ai/v1/chat/completions`, default model `grok-4.20-0309-non-reasoning` overridable via `XAI_MODEL`. Holds the long `ANCHOR_RUBRIC` prompt, three category prompts, JSON parser with code-fence-stripping fallback, and the public `analyzeFace`, `analyzeFaces`, `analyzeQuick` exports.

---

## Environment variables

Create `.env.local` in the project root with whichever of these you want active:

```bash
# Required for any real scoring
XAI_API_KEY=
XAI_MODEL=grok-4.20-0309-non-reasoning   # optional override

# Optional, but if missing the API treats requests as un-rate-limited
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional, used by the share copy ("rate yours at …")
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Required for the leaderboard, accounts, and (Phase 2+) battles.
SUPABASE_URL=                          # Supabase project URL
SUPABASE_ANON_KEY=                     # Supabase anon (public) key, used for storage + leaderboard reads/writes
DATABASE_URL=                          # Postgres connection string (use Supabase's "Connection Pooling" URL)

# Required for Auth.js v5 (Phase 0+)
AUTH_SECRET=                           # 32+ random bytes; generate with `openssl rand -base64 32`
AUTH_GOOGLE_ID=                        # Google OAuth client ID
AUTH_GOOGLE_SECRET=                    # Google OAuth client secret
AUTH_APPLE_ID=                         # Apple Service ID
AUTH_APPLE_SECRET=                     # Apple JWT (signed with .p8 key)
AUTH_MICROSOFT_ENTRA_ID_ID=            # Microsoft Entra app (client) ID
AUTH_MICROSOFT_ENTRA_ID_SECRET=        # Microsoft Entra client secret
AUTH_RESEND_KEY=                       # Resend API key for magic-link email
AUTH_RESEND_FROM=hello@holymog.com     # sender address (verified domain in Resend)
AUTH_TRUST_HOST=true                   # required when behind Vercel + custom auth domain
NEXTAUTH_URL=https://holymog.vercel.app   # currently the production URL; flip to https://auth.holymog.com later
# AUTH_COOKIE_DOMAIN=.holymog.com       # set this ONLY after we flip to the custom domain (auth + www split)
```

Only `XAI_API_KEY` is strictly required for solo scanning — the other services gate higher-tier functionality (see [Optional infrastructure](#optional-infrastructure)). Accounts (Phase 0+) require all five Supabase + DATABASE_URL + AUTH_* + Resend env vars set.

---

## Optional infrastructure

The app degrades gracefully when optional services aren't configured.

| Service          | Used for                                | Without it…                                                    |
| ---------------- | --------------------------------------- | -------------------------------------------------------------- |
| **xAI**          | All scoring (live meter + breakdown)    | `/api/score` and `/api/quick-score` return `503 vision_unavailable`; the camera flow surfaces the error. |
| **Upstash**      | IP rate-limiting on `/api/score`, `/api/leaderboard` POST | No limit applied (fine for local dev). |
| **Supabase**     | Leaderboard read + write, optional photo upload to `holymog-faces` bucket | `/leaderboard` shows "leaderboard not yet available", `/api/leaderboard` POST returns 503 `leaderboard_unconfigured`. |

### Supabase schema

```sql
create table leaderboard (
  id          uuid primary key default gen_random_uuid(),
  account_key text not null unique
    check (account_key ~ '^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{8}$'),
  name        text not null,
  overall     int  not null check (overall  between 0 and 100),
  tier        text not null,
  jawline     int  not null check (jawline    between 0 and 100),
  eyes        int  not null check (eyes       between 0 and 100),
  skin        int  not null check (skin       between 0 and 100),
  cheekbones  int  not null check (cheekbones between 0 and 100),
  image_url   text,
  image_path  text,
  created_at  timestamptz not null default now()
);

-- Public storage bucket for opt-in face photos
-- (created via Supabase Studio with name 'holymog-faces', public read)
```

`account_key` is the per-user "password" the API uses to UPDATE an existing row instead of inserting a duplicate. The `unique` constraint is what actually enforces uniqueness — the auto-created index also makes key lookup O(log n). `image_path` mirrors `image_url` but stores the storage-bucket path (not the public URL) so that the API can call `supabase.storage.remove([path])` to clean up a row's old photo on update.

---

## Running locally

```bash
# Install
npm install

# Create .env.local with at minimum XAI_API_KEY=...
# (see "Environment variables" above for the full list)

# Dev (defaults to http://localhost:3000)
npm run dev

# Production build + serve
npm run build
npm run start
```

- Camera APIs require an HTTPS context **or** `localhost`.
- The MediaPipe model and WASM are fetched from Google CDNs the first time the camera mounts (~5 MB). A loading delay of a few seconds on first detection is normal on a cold cache.
- Set `NEXT_PUBLIC_APP_URL` to whatever URL the app will be served at — it's baked into the share copy and the rendered share PNG's "rate yours at …" line.
- The `dev` script uses Next 16's default bundler (Turbopack). No special flags are needed.

---

## Build & deploy

The app is a vanilla Next 16 App Router project with no special build flags. It runs on any host that supports Node serverless or edge functions; Vercel is the natural fit. If you deploy:

- Set every required env var (`XAI_API_KEY`) plus whichever optional ones you want active.
- The `/api/debug-log` route writes to `/tmp/holymog-debug.log`. On serverless platforms this disk is ephemeral per-invocation and the file is effectively useless — you can leave it alone or remove the route.
- If you front the API with a CDN, make sure `dynamic = 'force-dynamic'` is honoured (default on Vercel — these routes won't be cached).
- The `holymog-faces` Supabase bucket should be public-read so leaderboard avatars resolve without signed URLs.

---

## Privacy

The privacy posture is intentional and is shown verbatim in `PrivacyModal`:

1. **Photos are sent to xAI for inference and discarded.** Nothing is persisted server-side by holymog itself for the scoring path.
2. **Shares only contain the tier letter.** The PNG generated by `lib/shareImageGenerator.ts` doesn't embed the user's photo or sub-scores.
3. **Leaderboard is opt-in.** Submission requires the user to type a name and explicitly check the "also share my photo" toggle if they want their face on the public board. Without that checkbox the row is name + scores only.
4. **localStorage** holds:
   - `holymog-last-result` — the most recent `{ scores, capturedImage, ts }` for hydration on return visits.
   - `holymog-privacy-acknowledged` — a single `'1'` flag so the privacy modal doesn't reappear.
   - `holymog-account-{key,name,photo-pref,overall}` — the user's leaderboard "account" so resubmitting from the same device updates their existing row instead of creating a duplicate. None of these are sent anywhere except the user's own `POST /api/leaderboard` call. See [Leaderboard accounts](#leaderboard-accounts-8-char-keys) for the full design.

`/api/debug-log` is a developer affordance only and writes to a local tmp file — don't ship it as-is to a multi-tenant environment.

---

## Leaderboard accounts (8-char keys)

There are no sign-ups, emails, or passwords. Instead, the very first time a user submits to the leaderboard, the server generates an 8-char Crockford-uppercase key (alphabet `[A-HJKMNPQRSTVWXYZ0-9]`, ~32⁸ ≈ 1.1 trillion combinations) and returns it. The user copies or downloads it once, and from then on:

- **Same device:** the key sits silently in localStorage. Reopening the modal auto-fills the form with their saved name + photo preference + previous overall, and the submit button shows a side-by-side comparison vs. the new scan ("Replace" / "Replace anyway"). Submission updates the existing row in place.
- **New device:** the user clicks "have a key from another device?", pastes the 8 characters, the modal fetches `/api/account/[key]`, prefills, and from then on this device is the same as a same-device flow.

Server-side enforcement:
- `account_key` column is `unique not null` with a regex check at the DB layer.
- `POST /api/leaderboard` regenerates the key on the rare unique-violation (up to 5 retries) — collision-handled even if the alphabet ever shrinks.
- `GET /api/account/[key]` is rate-limited under a separate `acct:` bucket so leaderboard write traffic doesn't compete with lookup traffic.
- Photo uploads always replace cleanly: `image_path` is persisted alongside `image_url` so `UPDATE`s can call `supabase.storage.remove([oldPath])` best-effort before writing the new path.

Client-side ergonomics:
- `useAccount` reads localStorage **synchronously** on first render (lazy `useState` initializers), so the comparison block lands in the very first paint of the modal — no 100ms flash.
- The submit modal does its reset + prefill in a single `useLayoutEffect` (runs synchronously after commit, before paint) for the same zero-flash reason.
- Successful submits clear the `holymog-leaderboard-cache-v1` sessionStorage entry so the user's new/updated row is reflected on their next `/leaderboard` visit.

Tradeoffs:
- The key is the only thing standing between an attacker and overwriting someone's row. Anyone who steals the key can edit the entry. That's acceptable for a leaderboard — there's no real value in the row beyond bragging rights.
- The key is shown to the user *exactly once* on first submission. Lose it → they can submit again as a new entry, but the old entry becomes orphaned. No recovery flow — by design.

---

## Notes for future contributors

- **Next.js 16, not 14.** App-router APIs and conventions differ from older mental models. When in doubt, read `node_modules/next/dist/docs/` for the version actually installed. Ignore stale Stack Overflow answers about the App Router.
- **All real work happens client-side.** The only server code is the four API routes; the home page is fully `'use client'`. Don't be tempted to push the camera or face detection server-side — the latency would kill the scan choreography.
- **The 8-second scan window is dialled in.** Changing `COUNTDOWN_MS`, `SCAN_MS`, `WARMUP_BEFORE_END`, the heavy-capture times, or `REAL_INTERVAL_MS` will desync the spiderweb / live meter / capture timing. If you do change them, re-test that the warmup result lands as the countdown disappears (no flash) and that both heavy frames are captured before `TOTAL_DELAY_MS`.
- **Adding a vision field?** Update three places: the relevant `*_KEYS` array + JSON shape in `lib/vision.ts`, the `VisionScore` type in `types/index.ts`, and either `visionContribution` or `computePresentation` in `lib/scoreEngine.ts` (otherwise the field will round-trip but never affect the user-visible scores). Surface it in `MoreDetail.tsx` if you want it to appear in the breakdown.
- **The only way to feel the timing is to run it.** When you change anything in `app/page.tsx`'s scan effect or the live meter, scan yourself for real — type checks won't catch a flash or a missing pill.
