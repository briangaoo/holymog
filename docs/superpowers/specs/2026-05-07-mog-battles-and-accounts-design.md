# Mog Battles + Accounts — Design

**Date:** 2026-05-07
**Status:** awaiting approval to begin implementation
**Authors:** brian gao, claude

---

## 1. Goal

Add two major capabilities to holymog, additively over the existing solo-scan + key-tagged leaderboard system:

1. **Mog Battles** — real-time multiplayer face-rating in two flavours.
   - **Public 1v1** — Omegle-style random matchmaking.
   - **Private parties** — up to 10 people, joined via a 6-char alphanumeric code, Zoom-grid layout.

   Each battle is **10 seconds**. Per-player scoring uses a **lighter Grok prompt** that returns `{ overall, improvement }`, where `improvement` is one of a fixed enum (jawline / eyes / skin / cheekbones / nose / hair). **10 real Grok calls + 10 synthetic = 20 visible score updates per player per battle**, mirroring the solo scan jitter pattern. **Highest peak score wins** (tiebreak: earliest joiner). Each tile shows a live "improvement" ticker that updates with the latest call.

2. **Accounts** — sign-in via Supabase Auth (Google + Apple OAuth + email magic link), now **required for everything except solo scanning**. Unlocks:
   - **Leaderboard submission** (auth-gated). Each account has at most one leaderboard entry, identified by `user_id`.
   - **Public battles + private parties** (both creating and joining are auth-gated).
   - **ELO** from public 1v1 battles (private parties never affect ELO — anti-farming).
   - **Private stats** — full 30-field breakdown of the user's best scan.
   - **Multiplayer stats** — ELO, peak ELO, W/L, streaks, "most-called weakness".

There is no anonymous-with-key tier. The previous 8-char Crockford key system is **fully removed** — the leaderboard is account-tagged via `user_id` end to end. Pure anonymous users can still scan their own face but cannot submit to the leaderboard, do battles, or see stats.

---

## 2. Identity model

Two tiers:

| Tier | What unlocks |
|---|---|
| **Pure anonymous** | Solo scans only — view tier reveal, sub-scores, share image, see breakdown locally. Cannot submit to leaderboard, do battles, or persist any state on the server. |
| **Signed in** | Everything: leaderboard submission/edit, public battles, private parties (create + join), ELO, private + multiplayer stats. |

Leaderboard submission, battles, and stats are all auth-gated. Anonymous users tapping any of those entrypoints see the auth modal first.

**Identity is `user_id` end to end.** Leaderboard rows are owned by their `user_id` foreign key — no separate keys, no linking step, no migration. There is exactly one leaderboard entry per account; resubmitting updates that one row in place.

---

## 3. Routes

```
/                  → home (NEW — hub page)
/scan              → solo scan flow (MOVED from /)
/mog               → battle hub (NEW — find / create / join, then live battle)
/leaderboard       → paginated leaderboard (existing)
/account           → stats + settings (NEW, requires auth)
/auth/callback     → Supabase OAuth/magic link callback (NEW)
```

Existing bookmarks to `/` continue to work — they just see the new hub instead of the scan immediately. Camera permission is now requested only when the user actively starts a scan from `/scan`, not on the bare home page.

---

## 4. Home page

Mobile-first vertical card stack:

```
┌──────────────────────────────────────────┐
│  holymog                        🟢/avatar │   ← header always present
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   📸                                │ │
│  │   scan                              │ │   ← primary card (tallest, brightest)
│  │   rate your face F- → S+            │ │
│  │   [your last: A · 78]               │ │   ← only if stored result OR best_scan
│  │   [ start a scan ]   ──────────►    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   ⚔️                                │ │
│  │   mog battles                       │ │   ← secondary card
│  │   live face-offs · up to 10         │ │
│  │   [ELO 1247 · 12W / 4L]             │ │   ← only if signed-in
│  │   [ find a battle ]   ──────────►   │ │
│  │   [ create / join private ]         │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ─────────────────────────────────      │
│   🏆 leaderboard            →            │   ← tertiary link
│   ⚙ about · privacy · github             │   ← footer
└──────────────────────────────────────────┘
```

- **Scan card** — full-width, taller; signature cyan→purple gradient (the S-tier accent).
- **Battle card** — full-width, shorter; red/orange combat accent.
- **Leaderboard** — single-line link, not a card.
- **Header** — wordmark left + avatar/sign-in pill right. Same component on `/`, `/mog`, `/leaderboard`, `/account`. NOT on `/scan` (camera UI keeps its existing fixed wordmark over the video).

For logged-in users, the cards inline a few personal cues:
- Scan card: "your last: A · 78" pulled from localStorage.
- Battle card: "ELO 1247 · 12W / 4L" pulled from `profiles`.
- Leaderboard link: "you're #43" pulled from a quick rank query.

---

## 5. Auth flow

### 5.1 Setup

Supabase Auth providers configured:
- **Google OAuth** — set up via Google Cloud Console; client ID + secret pasted into Supabase dashboard.
- **Apple OAuth** — set up via Apple Developer; service ID + key + team ID pasted into Supabase.
- **Email magic link** — uses Supabase's default SMTP (or Resend integration if deliverability matters).

No new env vars. All provider secrets live in Supabase.

Callback route: `/auth/callback` exchanges the OAuth code/magic-link token for a session, creates a `profiles` row if first-time sign-in, performs same-device key auto-migration, redirects to original entry point preserved through `?next=`.

**Default display_name on profile creation:**
- Google OAuth → `user_metadata.name` if present, else `user_metadata.email`'s local-part.
- Apple OAuth → `user_metadata.name`, else email local-part. (Apple often returns `null` for name on subsequent sign-ins; we capture only on first.)
- Magic link → email local-part.

All defaults run through `lower()` since the site is fully lowercase. If the resulting name is empty (degenerate case), the callback redirects to `/account?firstrun=1` which forces a "pick a display name" inline form before the user can do anything else. Names are not enforced unique — multiple accounts can share the same display name.

### 5.2 Sign-in modal

One modal, opened from three entry points (header avatar, battle entrypoint, account-page redirect). Title is contextual ("sign in" / "sign in to battle"). Body is identical:

```
┌────────────────────────────────────────┐
│  sign in to battle                  ✕  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ⌘  continue with google         │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  ⌘  continue with apple          │  │
│  └──────────────────────────────────┘  │
│           ──── or ────                 │
│  ┌──────────────────────────────────┐  │
│  │  📧 email me a link              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  by signing in you agree to TOS / PP   │
└────────────────────────────────────────┘
```

The "email me a link" button expands inline into an email input + "send link" button. After send, status hint shown ("check your inbox"). On magic-link click in the email, the browser opens `/auth/callback?token=...` and same flow as OAuth resumes.

### 5.3 Edge cases

- **Sign out:** clears Supabase auth state. The user reverts to pure anonymous — they can still scan, but the leaderboard modal closes if open and any battle in progress disconnects gracefully.
- **Account deletion:** out of scope for v1. Reach out via the privacy contact if requested manually.

### 5.4 Auth state surface in existing UI

The leaderboard modal only opens for signed-in users. The "you · {display name}" identity chip stays at the top of the modal whenever it's open. There is no key, no masked-key chip, no paste-key form anywhere in the product.

---

## 6. Database schema

The existing `leaderboard` table is **modified** to drop the legacy 8-char key system and switch to account-based ownership. New tables for accounts and battles. One destructive operation at deploy time — see §6.6 migration script.

### 6.1 `profiles`

```sql
create table profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text not null,
  elo                int  not null default 1000,
  peak_elo           int  not null default 1000,
  matches_played     int  not null default 0,
  matches_won        int  not null default 0,
  current_streak     int  not null default 0,
  longest_streak     int  not null default 0,
  best_scan_overall  int,
  best_scan          jsonb,           -- { vision: VisionScore, scores: FinalScores }
  improvement_counts jsonb not null default '{}'::jsonb,
                                       -- { jawline: 12, eyes: 5, skin: 3, ... }
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

**RLS:**
- `select`: any authenticated user (display name + ELO + peak score visible to others for opponent display).
- `insert/update`: only `auth.uid() = user_id`.

The `improvement_counts` JSONB stores a histogram of which improvement labels Grok has assigned to this user across all their public battles. Used for the "most-called weakness" stat.

### 6.1a `leaderboard` (modified, breaking change)

The existing `leaderboard` table loses `account_key` and `image_path` is preserved. A new `user_id` column becomes the primary identity:

```sql
-- Run as part of the Phase 0 migration (§6.6).

-- Drop the key-tagged columns from the legacy schema.
alter table leaderboard drop column if exists account_key;
-- (image_path stays; still used for storage cleanup on photo replace)

-- New: account ownership.
alter table leaderboard
  add column user_id uuid not null references auth.users(id) on delete cascade,
  add constraint leaderboard_one_row_per_user unique (user_id);

-- Existing rows have no user_id, so we wipe the table and the photo bucket
-- as part of the deploy. Spec §6.6 makes this explicit.
```

**RLS:**
- `select`: open (the leaderboard is public).
- `insert/update/delete`: only `auth.uid() = user_id`.

### 6.2 `battles`

```sql
create table battles (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('public', 'private')),
  code            text unique
                    check (code is null or code ~ '^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{6}$'),
  host_user_id    uuid references auth.users(id) on delete set null,
  livekit_room    text not null,
  state           text not null default 'lobby'
                    check (state in ('lobby','starting','active','finished','abandoned')),
  max_participants int not null default 10,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index battles_code_idx on battles (code) where code is not null;
create index battles_state_idx on battles (state);
```

**RLS:**
- `select`: users who have a row in `battle_participants` for this battle (subquery).
- `insert/update`: via API routes only, using the service role key.

### 6.3 `battle_participants`

```sql
create table battle_participants (
  id            uuid primary key default gen_random_uuid(),
  battle_id     uuid not null references battles(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null,
  peak_score    int  not null default 0,
  final_score   int,
  is_winner     boolean not null default false,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  unique (battle_id, user_id)
);

create index participants_user_idx on battle_participants (user_id);
create index participants_battle_idx on battle_participants (battle_id);
```

**RLS:**
- `select`: users in the same battle (subquery).
- `insert/update`: via API routes only.

### 6.4 `matchmaking_queue`

```sql
create table matchmaking_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create index queue_age_idx on matchmaking_queue (created_at);
```

**RLS:**
- `select/delete`: `auth.uid() = user_id` (a user can see/cancel their own entry).
- `insert/update`: via API routes only.

### 6.5 No `battle_calls` table

Per-call results are broadcast over Supabase Realtime (ephemeral) and aggregated live into `battle_participants.peak_score` and `profiles.improvement_counts`. We never need to query individual calls after the battle ends.

### 6.6 Migration script

A single SQL file (`docs/migrations/2026-05-07-battles-accounts.sql`) to be run in Supabase SQL editor. **Includes one destructive step**: the existing `leaderboard` table is wiped before adding the `user_id NOT NULL` column, since legacy rows have no `auth.users` mapping. The `holymog-faces` storage bucket is also emptied.

```sql
-- 1. Wipe legacy leaderboard rows (they have no user_id).
truncate table leaderboard;
-- (separately: delete all objects in the holymog-faces storage bucket via
--  Supabase Studio, since SQL doesn't reach storage — this is a manual step.)

-- 2. Drop legacy key column.
alter table leaderboard drop column if exists account_key;

-- 3. Add account ownership + uniqueness constraint.
alter table leaderboard
  add column user_id uuid not null references auth.users(id) on delete cascade,
  add constraint leaderboard_one_row_per_user unique (user_id);

-- 4. Tighten leaderboard RLS for the new world.
alter table leaderboard enable row level security;

create policy "leaderboard rows are world-readable"
  on leaderboard for select using (true);

create policy "users can insert their own leaderboard row"
  on leaderboard for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own leaderboard row"
  on leaderboard for update
  to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users can delete their own leaderboard row"
  on leaderboard for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. profiles, battles, battle_participants, matchmaking_queue tables
--    (defined in 6.1, 6.2, 6.3, 6.4 above — included in this same script).
```

The wipe is acceptable because per the previous discussion the production leaderboard has only test rows (which we already considered wiping for orientation-consistency reasons). All sign-ups post-Phase-0 start with empty entries and accumulate as users submit.

---

## 7. Mog Battles — architecture

### 7.1 Components

- **LiveKit Cloud (SFU)** — handles all video transport. One room per battle. Token-gated. Server issues tokens via `/api/battle/[id]/token`. Client uses `@livekit/components-react` for the grid (`<GridLayout>` is purpose-built for this).
- **Supabase Realtime** — one broadcast channel per battle (`battle:{id}`) for everything that's *not* video: score updates, peak updates, lifecycle transitions, participant joins/leaves.
- **Supabase Postgres** — `battles`, `battle_participants`, `matchmaking_queue`, `profiles`.
- **Vercel API routes** — token issuance, room codes, atomic queue pairing, scoring, finalisation.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (React)                              │
│  /          /mog          /account                                   │
│  scan       battle         stats + settings + key migration         │
│           ┌─ login modal (OAuth / magic link) ────────────┐         │
└──────┬────┴─────┬────────────┬──────────────────────────┬─┴─────────┘
       │          │            │                          │
       │ Grok     │ video      │ data                     │ auth tokens
       ▼          ▼            ▼                          ▼
 Vercel API   LiveKit SFU   Supabase Postgres        Supabase Auth
                                  ▲                       │
                                  └─── RLS-gated ─────────┘
```

### 7.2 Lifecycle

```
   lobby ────► starting ── 3s countdown ──► active ─ 10s ──► finished
     │
     └────► abandoned (timeout, all left, or host disconnect)
```

- **`lobby`** — public 1v1: server has paired but countdown hasn't begun. Private: host has created, sharing code, joiners trickle in.
- **`starting`** — server stamps `started_at = now() + 3s`. All clients count down to that timestamp. The 3s gives LiveKit time to settle and gives players a "get ready" beat.
- **`active`** — clients fire scoring calls. 10 seconds of wall-clock from `started_at`.
- **`finished`** — peak-score winner determined; ELO + stats applied (public only); reveal screen rendered.
- **`abandoned`** — fallback when nobody pulls the trigger to start within ~5 minutes, or all participants leave during lobby.

### 7.3 Public 1v1 matchmaking (atomic pairing)

Single Postgres transaction. Wrapped as a Supabase RPC `pair_two()` invoked on every queue insert:

```sql
with pair as (
  select id, user_id, display_name
  from matchmaking_queue
  order by created_at
  limit 2
  for update skip locked
),
new_battle as (
  insert into battles (kind, livekit_room, state)
  select 'public', 'public-' || gen_random_uuid()::text, 'starting'
  where (select count(*) from pair) = 2
  returning id
),
delete_queue as (
  delete from matchmaking_queue
  where id in (select id from pair) and exists (select 1 from new_battle)
),
inserted_participants as (
  insert into battle_participants (battle_id, user_id, display_name)
  select b.id, p.user_id, p.display_name
  from new_battle b cross join pair p
  returning battle_id
)
select id from new_battle;
```

If the RPC returns a battle_id, two players got paired in one atomic transaction. If it returns nothing (only 1 in queue), the new entrant just sits and waits.

**Stale queue cleanup** runs in the same API route, before the pair RPC: `delete from matchmaking_queue where created_at < now() - interval '60 seconds'`. No cron required.

**Notification of pairing:** the waiting player subscribes to a Supabase Realtime postgres-changes feed filtered to `battle_participants` rows where `user_id = auth.uid()`. The INSERT triggered by pairing fires the subscription. Client gets the new `battle_id`, fetches a LiveKit token, joins the room.

### 7.4 Private party flow

```
host POST /api/battle/create
  → server: generate 6-char Crockford code (retry on collision, ~5x)
  → server: insert battles row with kind='private', state='lobby', host_user_id
  → server: insert host as first participant
  → returns { battle_id, code, livekit_room }

joiner POST /api/battle/join { code }
  → server: SELECT battle WHERE code = $code AND state = 'lobby'
  → server: enforce max_participants
  → server: INSERT battle_participants
  → returns { battle_id, livekit_room }

host POST /api/battle/start
  → guard: auth.uid() = host_user_id
  → guard: count(participants) >= 2
  → server: UPDATE battles state='starting', started_at = now() + interval '3s'
  → realtime fires on battles row → all clients see the transition + countdown
```

### 7.5 Realtime channels

One channel per battle: `battle:{id}`. Three event types:

1. **`participant.joined`** — broadcast on new `battle_participants` INSERT for this battle. Clients add the tile.
2. **`participant.left`** — broadcast when `left_at` is set or LiveKit detects disconnect. Tile dims.
3. **`score.update`** — server-broadcast right after each `/api/battle/score` resolves: `{ user_id, overall, improvement, peak, ts }`. Clients update the relevant tile's score number, ticker label, and peak badge.

Plus a separate **`battle.finished`** broadcast on finalisation carrying the full result payload.

LiveKit handles video on a separate connection. The Realtime channel is data-only.

### 7.6 Battle UI (`/mog`)

Single SPA page with substates:

| Substate | Trigger | UI |
|---|---|---|
| **mode-select** | route entry, no battle in flight | 3 buttons: "find a battle", "create private", "join private (enter code)" |
| **queueing** (public only) | after POST `/api/battle/queue` | "looking for an opponent…" + cancel button |
| **lobby** (private only) | after create or join | grid of joined participants, host has "start battle" button (greyed if <2), others see "waiting for host" |
| **starting** | `battles.state = 'starting'` | 3-2-1 countdown overlay on the grid |
| **active** | `battles.state = 'active'` | full grid: video + score number + improvement ticker + peak badge per tile, 10s countdown timer in corner |
| **finished** | `battles.state = 'finished'` | dim non-winner tiles, highlight winner with confetti + tier badge, "rematch" (private) / "find another" / "back to home" |

LiveKit `<GridLayout>` handles responsive sizing automatically:
- 2 players: 50/50 split (omegle-style)
- 3-4: 2x2
- 5-6: 2x3 or 3x2
- 7-9: 3x3
- 10: 5x2 or 2x5

### 7.7 Battle Grok prompt (lightweight scoring)

Different from existing `/api/quick-score` and `/api/score`. Single image, returns `{ overall, improvement }`.

```
Score this face's overall attractiveness 0-100 and identify the single
feature most needing improvement.

Pick the improvement from EXACTLY these options:
  jawline, eyes, skin, cheekbones, nose, hair

If the face is making a deliberately distorted/contorted expression, score 5-25.
A natural smile is NOT distortion.

Output ONLY: {"overall": <int 0-100>, "improvement": "<one of the 6>"}
```

- Single image, `detail: 'low'`, `model: grok-4.20-0309-non-reasoning`.
- Latency: ~700–900ms per call.
- Cost: ~0.4K input tokens × $1.25/1M = $0.0005 per call. A 10-player private = 100 calls = $0.05 per battle.

Validation: parse JSON, retry once with strict-prefix on parse failure, fall back to `{ overall: 50, improvement: 'eyes' }` if both fail (rare). Server also defensively clamps `improvement` to the 6-option enum — if Grok hallucinates a label outside the set, we coerce to `'eyes'`.

**Frame source for the scoring call.** LiveKit owns the user's camera in a battle (it published the local track on join). To capture a frame for `/api/battle/score`, we attach the LiveKit `LocalVideoTrack`'s underlying `MediaStreamTrack` to a hidden off-screen `<video>` element, then draw it to a canvas (mirrored horizontally to match the existing solo-scan capture convention) and `toDataURL('image/jpeg', 0.85)` it. The same JPEG goes up to `/api/battle/score`. We never need a separate `<video>` for the user's own preview — LiveKit's `<ParticipantTile>` already shows it in the grid.

### 7.8 Scoring submission flow

```
client (during active window, fires every ~1s) →
  POST /api/battle/score { battle_id, imageBase64 }
   ↳ server: assert auth.uid() in battle_participants for battle_id
   ↳ server: assert battles.state = 'active' AND now() < started_at + 11s
   ↳ server: call Grok with the lightweight prompt
   ↳ server: UPDATE battle_participants.peak_score = greatest(peak, overall)
   ↳ server: UPDATE profiles.improvement_counts
       SET = jsonb_set(coalesce(improvement_counts, '{}'),
                       '{<improvement>}',
                       (coalesce((improvement_counts->>'<improvement>')::int, 0) + 1)::text::jsonb)
   ↳ server: broadcast score.update on battle:{id}
   ↳ returns 200 (no body — broadcast carries the value, avoiding duplicate update)
```

**Synthetic jitter** (the 10 faked between-real updates) happens entirely client-side, exactly mirroring the existing solo scan jitter logic. Synthetic updates are NOT broadcast to other clients — only the player themselves sees jitter on their own tile.

### 7.9 Finalisation

Triggered by the *first* client to POST `/api/battle/finish { battle_id }` after the active window has elapsed (10s + 2s grace).

```
finish endpoint (idempotent):
  1. assert battles.state = 'active' AND now() >= started_at + 10s
     (if state already 'finished', return cached result — covers race)
  2. select participants order by peak_score desc, joined_at asc
     → first row is winner, ties broken by earliest join time
  3. update participants: is_winner=true for #1, final_score = peak_score for all
  4. if kind='public': apply ELO updates (§8) — both players are guaranteed
     signed-in accounts under our auth gate
  5. update battles.state='finished', finished_at=now()
  6. broadcast battle.finished on battle:{id} with the full result payload
  7. return result payload to caller
```

All clients fire `/api/battle/finish` simultaneously when their countdown ends; the idempotency guard ensures only the first one does the work, the rest receive the cached result. This avoids needing any server-side timer / cron.

---

## 8. ELO

Standard formula, applied only to **public 1v1** battles (private parties never touch ELO):

```
expected_a = 1 / (1 + 10^((rating_b - rating_a) / 400))
new_rating_a = rating_a + K * (score_a - expected_a)
```

- `score_a` = 1 for winner, 0 for loser.
- `K` = **32** for the first 30 matches (provisional), **16** thereafter. Computed per-player based on `profiles.matches_played`.
- Both players always signed-in accounts (auth gate), so we always have ELO on both sides.

After every public battle finalisation, for the (winner, loser) pair:

```
expected_w = 1 / (1 + 10^((R_l - R_w) / 400))
expected_l = 1 - expected_w
K_w = profiles[w].matches_played < 30 ? 32 : 16
K_l = profiles[l].matches_played < 30 ? 32 : 16
R_w_new = max(0, R_w + K_w * (1 - expected_w))
R_l_new = max(0, R_l + K_l * (0 - expected_l))
```

Profile updates after each public match:
- `elo` ← R_new (clamped to ≥ 0)
- `peak_elo` ← max(peak_elo, elo)
- `matches_played` ← +1 (both)
- `matches_won` ← +1 (winner only)
- `current_streak` ← +1 (winner) or 0 (loser)
- `longest_streak` ← max(longest_streak, current_streak)

Computation runs in the finalisation transaction so a crash mid-update can't leave one profile updated without the other.

---

## 9. Stats

### 9.1 Private stats (best scan)

When a signed-in user finishes a scan, the existing `/api/score` flow checks if the new `final.overall` exceeds `profiles.best_scan_overall`. If yes, atomically writes:
- `best_scan_overall = final.overall`
- `best_scan = { vision: VisionScore, scores: FinalScores }` (full breakdown JSONB)

The `/account` page reads these and renders a full breakdown using the existing `MoreDetail` component (extracted from `app/page.tsx` so it can be reused).

### 9.2 Multiplayer stats (visible on `/account`)

Computed from `profiles` row directly — no joins:

```
ELO:                  1247  (peak: 1310)
Matches:              28W / 14L (66.7%)
Current streak:       4
Longest streak:       9
Most-called weakness: jawline (47 times)
```

"Most-called weakness" = `argmax(profiles.improvement_counts)`.

Private parties don't increment `matches_played` / `matches_won` (anti-farming) but DO contribute to `improvement_counts` (since that's about the user's face, not their skill).

---

## 10. Account page (`/account`)

Three tabs:

```
┌────────────────────────────────────────┐
│  ←  account                            │
│                                        │
│  [avatar]  brian gao                   │
│            since 2026-05-07            │
│                                        │
│  ─── tabs ────────────────────────  │
│  [stats] [history] [settings]          │
│                                        │
│  (active tab body)                     │
│                                        │
└────────────────────────────────────────┘
```

**Stats tab (default):**
- Big card: best scan tier letter + score + tap to see full breakdown (uses `MoreDetail`).
- Card: ELO + peak ELO + W/L + win-rate + streaks.
- Card: most-called weakness with histogram.
- Card: total battles played (public 1v1 + private split).

**History tab (deferred to phase 5):**
- Scrollable list of past public battles with opponent name, ELO change, win/loss.

**Settings tab:**
- Display name (editable, max 24 chars, lowercase enforced).
- Sign out button.

---

## 11. API endpoint inventory

### 11.1 Auth-related (NEW)

- `GET /api/account/me` — return the current authenticated user's profile + their leaderboard entry (if any). Used to prefill the leaderboard modal on open. Returns `{ profile: { ... }, entry: LeaderboardRow | null }`. Status: 200 if signed in, 401 if not. No more key-based lookup endpoint — identity is the session.

### 11.2 Battle-related (NEW)

| Endpoint | Method | Body | Returns |
|---|---|---|---|
| `/api/battle/queue` | POST | — | `{ battle_id }` if paired immediately, else `{ queued: true }` |
| `/api/battle/queue` | DELETE | — | `{ ok: true }` |
| `/api/battle/create` | POST | — | `{ battle_id, code, livekit_room }` |
| `/api/battle/join` | POST | `{ code }` | `{ battle_id, livekit_room }` |
| `/api/battle/start` | POST | `{ battle_id }` | `{ ok: true }` (host only) |
| `/api/battle/leave` | POST | `{ battle_id }` | `{ ok: true }` |
| `/api/battle/[id]/token` | GET | — | `{ token, url }` (LiveKit access token) |
| `/api/battle/score` | POST | `{ battle_id, imageBase64 }` | `200` (broadcast carries data) |
| `/api/battle/finish` | POST | `{ battle_id }` | `{ result: { winner, participants[] } }` |

All require auth (Supabase session). Battle-specific endpoints additionally check participant membership via RLS or explicit subqueries.

### 11.3 Existing endpoints (modified)

- `POST /api/quick-score` — solo live meter. Unchanged.
- `POST /api/score` — solo full breakdown. **Modification:** when called by a signed-in user, also updates `profiles.best_scan{_overall}` if the new score exceeds the stored best.
- `GET /api/leaderboard?page=N` — paginated list. Unchanged externally; rows now carry `user_id` instead of `account_key`.
- `POST /api/leaderboard` — **breaking change.** Now requires an authenticated session. Body `{ name, scores, imageBase64? }` — no `key` field. Server inserts (or upserts on `user_id`) a row owned by `auth.uid()`. Returns `{ entry, isNew: boolean }`. 401 if unauthenticated.
- `GET /api/account/[key]` — **REMOVED.** Replaced by `GET /api/account/me` (§11.1).
- `POST/DELETE /api/debug-log` — local dev only. Unchanged.

---

## 12. Client UX flows

### 12.1 Logged-out user

- Lands on `/`.
- Taps "scan" → `/scan`. Solo flow works fully — they see their tier and breakdown locally.
- After the scan, taps "submit to leaderboard" → auth modal opens with title "sign in to submit".
- Taps "find a battle" → auth modal opens with title "sign in to battle".
- Taps "leaderboard" → can read the public board fine; the "your rank" / "submit your score" affordances are replaced with "sign in to add yourself".

### 12.2 Logged-in user

- Lands on `/`. Personalised stat strips inline on cards.
- Taps "scan" → `/scan`. Existing solo flow. Server-side: profile.best_scan updated silently if new high.
- Taps "find a battle" → `/mog` → enters queue → matched → 3s countdown → 10s active → result → ELO updated → "find another?" CTA.
- Taps "create private" → `/mog?create=1` → battle created → modal shows code + share button → wait in lobby (joiners trickle in via realtime) → host clicks start → countdown → active → result → "rematch" CTA.
- Taps "join private (enter code)" → `/mog?join=1` → enters code → joins lobby → wait for host → battle.

### 12.3 `/account`

- Tab 1 (stats): private + multiplayer.
- Tab 2 (history): deferred.
- Tab 3 (settings): display name, sign out.

---

## 13. Phasing

End-to-end build, organised into shippable phases. Each ends in a deployable state.

### Phase 0 — Auth + Profile + Account-tagged leaderboard
- Supabase Auth providers configured (Google, Apple, magic link).
- `profiles` table + RLS + initial migrations.
- **Breaking change to `leaderboard` table:** truncate, drop `account_key` column, add `user_id NOT NULL` with the unique-per-user constraint and the new RLS policies (§6.6 migration script).
- Empty the `holymog-faces` storage bucket (legacy photos with no `user_id` owner).
- Auth modal component + `/auth/callback` route.
- `GET /api/account/me` endpoint (replaces `/api/account/[key]`).
- `POST /api/leaderboard` rewritten: auth-gated, upserts on `user_id`, no key generation.
- `LeaderboardModal` rewritten: only opens for signed-in users; uses `/api/account/me` for prefill; drops the linked-key chip and the paste-key form entirely.
- `/account` page: settings tab (display name, sign out). Stats tab placeholder.
- Header avatar component, wired up across non-`/scan` routes.
- Removed: `lib/account.ts`, `hooks/useAccount.ts`, `components/AccountKeyCard.tsx`, `app/api/account/link-key/route.ts`, `app/api/account/[key]/route.ts` — all key-related code is deleted in this phase.

### Phase 1 — Home page + Route restructure
- `/` becomes the hub.
- `/scan` is the moved-from-`/` solo flow.
- Shared header component on `/`, `/mog`, `/leaderboard`, `/account`.
- Stored-result preview cards, logged-in stat strips (placeholder strips OK until phase 3).

### Phase 2 — LiveKit foundation + Battle scaffolding (1v1 public only)
- LiveKit Cloud account + project. Three env vars added to `.env.local` and Vercel project:
  - `LIVEKIT_API_KEY` — server-only, used to mint access tokens.
  - `LIVEKIT_API_SECRET` — server-only, paired with the key.
  - `NEXT_PUBLIC_LIVEKIT_URL` — public, the WebSocket endpoint clients connect to (e.g. `wss://holymog.livekit.cloud`).
- `battles`, `battle_participants`, `matchmaking_queue` tables + RLS.
- `pair_two()` Supabase RPC.
- API routes: `/api/battle/queue`, `/api/battle/[id]/token`, `/api/battle/score`, `/api/battle/finish`, `/api/battle/leave`.
- New lightweight Grok prompt + scoring endpoint.
- `/mog` route with mode-select + queueing + starting/active/finished sub-states.
- Score updates broadcast via Realtime channel.
- Finalisation logic.
- 1v1 fully playable end-to-end (no ELO yet, no private parties yet).

### Phase 3 — ELO + Stats wiring
- ELO update logic in `/api/battle/finish`.
- `improvement_counts` increment on each `/api/battle/score` call.
- Best-scan capture in `/api/score`.
- `/account` stats tab populated with real data.
- Home-page personalised stat strips populated.

### Phase 4 — Private parties
- 6-char Crockford code generation.
- API routes: `/api/battle/create`, `/api/battle/join`, `/api/battle/start`.
- Mode-select extended with create/join.
- Lobby UI for private (host start button, joiner trickle-in via realtime).
- LiveKit grid scaling tested up to 10 participants.

### Phase 5 — Polish
- Disconnect handling (mark `left_at`, dim tile, exclude from finalisation).
- Reconnection if user accidentally closes tab during battle.
- Battle-result share image (similar to existing solo share).
- "Rematch" CTA in private result screen.
- Account page history tab.
- Animations / SFX for countdown + winner reveal.

Each phase is a discrete shippable unit. After each, we deploy to production behind whatever we already have — no feature flags needed since new routes (`/scan`, `/mog`, `/account`) are simply new entrypoints; existing `/` continues to function until the home-page swap in Phase 1.

---

## 14. Risks + open questions

- **LiveKit free tier limits.** Cloud free tier is "a few thousand participant-minutes per month". A single 10-player 10s battle = 100 participant-seconds = 1.67 participant-minutes. Free tier handles ~1000 such battles per month. Worth monitoring; if usage outgrows it, evaluate self-hosted LiveKit on a VPS or Vercel-friendly alternative (Daily, 100ms).
- **Grok rate limits.** A 10-player party fires 100 calls in 10s = 10 RPS sustained. xAI's published rate limits should accommodate this but we should check the account's specific tier. If limits are hit, fallback to slower call cadence (e.g., one call per 1.5s = 6 real calls per battle instead of 10) — UI cadence already handles variable fire timing.
- **Supabase Realtime broadcast volume.** ~1000 events per 10-player battle. Within free-tier quotas but worth instrumenting.
- **Anonymous user funnel.** Anyone landing on home who isn't signed in can't use battles. Risk: people bounce. Mitigation: the locked battle card shows a brief preview / GIF / "live now" count to motivate sign-up.
- **Conversion friction.** Forcing sign-in to submit to the leaderboard means anonymous users who scan and want to brag now hit a gate they didn't before. Mitigation: the AuthModal copy on the leaderboard CTA is deliberately frictionless ("sign in with google · 5 seconds") and OAuth is one tap on mobile.
- **Malformed Grok JSON during a battle.** Reuse the existing solo flow's retry-with-strict-prefix logic. Final fallback: `{ overall: 50, improvement: 'eyes' }` (neutral).
- **Display name conflicts on leaderboard.** Multiple accounts can have the same `display_name`. Not enforced unique. Acceptable — leaderboard ordering is by score, names are just display.
- **LiveKit identity vs Supabase user_id.** LiveKit room participants are identified by a `participantIdentity` string. Use `user_id` as the identity. On token issuance, embed `display_name` in the token's metadata so the grid component can label tiles without an extra lookup.
- **Mobile camera permission timing.** On `/scan`, camera prompts on flow start. On `/mog`, LiveKit prompts when joining the room. The two flows coexist but never simultaneously.
- **Ratings deflation / floor.** ELO can go below 0 in pathological cases (lots of losses to high-rated opponents). We clamp to 0 in the formula. Could expose a stat-floor of 100 or 500 if it ever feels bad.
- **Tab-close mid-battle.** On `beforeunload`, fire `/api/battle/leave` (best-effort via `navigator.sendBeacon`). Server marks `left_at`. Other clients see tile dim. Finalisation excludes left players from winner consideration if they had no scores.

---

## 15. Out of scope (deferred)

Explicitly NOT in this design:

- Friend lists, friend-only matchmaking.
- Skill-based matchmaking (current public match is FIFO; no ELO-bracket pairing).
- Spectator mode for private parties.
- Battle replay / video archive.
- Account history feed (deferred to Phase 5+).
- Rematch with the same opponent (private parties get rematch via "start again" in lobby; public matches do NOT auto-rematch since it'd farm ELO; you go back to queue).
- Sound effects / haptics during battle.

These can be added incrementally after the v1 ships.

---

## 16. Acceptance criteria

The feature is considered shipped when:

1. A signed-in user can scan, view their best scan breakdown, and see their score on the leaderboard tagged to their account.
2. Two signed-in users on different devices can find each other via public matchmaking, see each other's video, and battle to completion. Each gets correct ELO updates.
3. A signed-in host can create a private party, share the code, have up to 9 friends join, start the battle, and see a 10-tile Zoom-style grid with live scores.
4. An anonymous user can scan exactly as today; tapping "submit to leaderboard" or any battle entrypoint cleanly opens the auth modal with the right contextual title.
5. After signing in, a user can submit one leaderboard entry (with optional photo) tied to their `user_id`. Resubmitting updates the same row in place.
6. The home page is a coherent hub, not the scan page.
7. Sign-in works via Google, Apple, and email magic link.
8. All `/account` stats are accurate and populated.
9. No regressions on existing solo scan / leaderboard flows.
10. Production deployment is stable under typical load (10–100 concurrent battles).
