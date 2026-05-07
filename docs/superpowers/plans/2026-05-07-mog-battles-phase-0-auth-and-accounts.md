# Mog Battles — Phase 0: Auth + Account-Tagged Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth–backed accounts (Google + Apple OAuth + email magic link), the `profiles` table, the `/account` page, and gate the leaderboard behind sign-in. Existing 8-char Crockford key system is fully removed; leaderboard rows are now `user_id`-tagged with one entry per account. Pure anonymous users keep solo scanning; everything else requires an account.

**Architecture:** All auth flows through Supabase Auth (already plumbed for our Postgres). `@supabase/ssr` gives us Next.js 16-compatible server + browser clients. A dedicated server callback route (`/auth/callback`) handles OAuth code exchange, magic-link verification, and creates the `profiles` row on first sign-in. The leaderboard table is migrated in a single SQL operation (truncate + drop `account_key` + add `user_id NOT NULL` + replace RLS). A handful of files (`lib/account.ts`, `hooks/useAccount.ts`, `components/AccountKeyCard.tsx`, `app/api/account/[key]/route.ts`) are deleted outright.

**Tech Stack:** Next.js 16 App Router, React 19.2, Supabase Auth + Postgres, `@supabase/ssr`, Tailwind v4, framer-motion (existing).

**Phasing roadmap (full picture, see spec):**
- **Phase 0 (this plan)** — Auth + Profiles + account-tagged leaderboard. No battles.
- **Phase 1** — Home page hub at `/`, scan moved to `/scan`, header on every non-`/scan` route.
- **Phase 2** — LiveKit foundation + 1v1 public battles end-to-end (no ELO yet).
- **Phase 3** — ELO + stats wiring (private + multiplayer).
- **Phase 4** — Private parties (room codes, host start, 10-tile grid).
- **Phase 5** — Polish (disconnect handling, share-image, history, animations).

Each subsequent phase gets its own plan written after the previous one ships.

---

## File Structure for Phase 0

**New files:**

| Path | Responsibility |
|---|---|
| `lib/supabase-server.ts` | Server-side Supabase client (auth-aware, uses cookies). Used in API routes and Route Handlers. |
| `lib/supabase-browser.ts` | Browser-side Supabase client (auth-aware). Used in client components. |
| `lib/supabase-admin.ts` | Service-role Supabase client for privileged ops (creating profiles bypassing RLS). |
| `hooks/useUser.ts` | Reactive Supabase user state. Returns `{ user, loading, signOut }`. |
| `app/auth/callback/route.ts` | Handles OAuth code exchange + magic-link token verification, creates profile, redirects. |
| `app/api/account/me/route.ts` | GET endpoint returning the current user's profile + their leaderboard entry (if any). |
| `app/account/page.tsx` | The `/account` page shell: header, tabs, sign-out. Renders one of three tab components. |
| `components/AuthModal.tsx` | The three-button auth modal (Google / Apple / magic link). Opens on demand, dismissable. |
| `components/AppHeader.tsx` | Wordmark + avatar/sign-in pill. Used on `/leaderboard` and `/account` in Phase 0; expands in Phase 1. |
| `components/AccountAvatar.tsx` | The avatar circle (or sign-in pill if logged out). Tappable when logged in to navigate to `/account`. |
| `components/AccountStatsTab.tsx` | Stats tab body. Phase 0 = empty-state placeholder. Real implementation in Phase 3. |
| `components/AccountHistoryTab.tsx` | History tab body. Phase 0 = "coming soon" placeholder. |
| `components/AccountSettingsTab.tsx` | Settings tab body: editable display name + sign out. (No key UI.) |
| `docs/migrations/2026-05-07-phase-0-auth-and-leaderboard.sql` | SQL migration: profiles table + leaderboard schema overhaul + RLS. User runs in Supabase SQL editor. |

**Modified files:**

| Path | Changes |
|---|---|
| `package.json` | Add `@supabase/ssr` dependency. |
| `app/api/leaderboard/route.ts` | Auth-gate the `POST` (and `DELETE` if any). Switch from `account_key` to `auth.uid()`. Use upsert on `user_id`. Drop the new-key-generation branch entirely. |
| `app/leaderboard/page.tsx` | Wrap content with `<AppHeader />`. The list rendering doesn't need to change since rows will start coming back with `user_id` instead of `account_key` (we don't render either). |
| `components/LeaderboardModal.tsx` | Major rewrite: only opens for signed-in users, fetches prefill from `/api/account/me`, drops the linked-key chip, paste-key form, post-issuance `AccountKeyCard`, and `useAccount` hook. Submit flow no longer carries a `key` field. |
| `app/page.tsx` | Where the modal is mounted, wrap the entrypoint with auth-gating: tapping "add to leaderboard" while logged out opens the auth modal first. |
| `lib/supabase.ts` | Update `LeaderboardRow` type: drop `account_key`, add `user_id`. |
| `lib/leaderboardCache.ts` | Update the cache shape if it references `account_key` anywhere; otherwise no change. |
| `README.md` | Add Phase 0 to the documented architecture; bump phasing roadmap. |

**Deleted files:**

| Path | Reason |
|---|---|
| `lib/account.ts` | Crockford key generation/validation — no longer used. |
| `hooks/useAccount.ts` | localStorage key trio — no longer used. |
| `components/AccountKeyCard.tsx` | Post-issuance key card UI — no longer applicable. |
| `app/api/account/[key]/route.ts` | Key-based account lookup — replaced by `/api/account/me`. |

**Routes touched: `/leaderboard`, `/account`, `/auth/callback`, `/api/account/me`, `/api/leaderboard`, `/`. The `/scan`, `/mog` routes are still unchanged in Phase 0 (they get reorganised in Phase 1).**

**Testing approach:** This codebase has no test suite. Following the existing pattern, verification per task is `npx tsc --noEmit` for compile correctness + manual smoke testing in the browser for UI tasks. The dev server should be running at `localhost:3002` throughout.

---

## Task 1: Install `@supabase/ssr`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install @supabase/ssr`
Expected: package added at `^0.5.x` or similar; no warnings.

- [ ] **Step 2: Typecheck baseline**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @supabase/ssr for Next 16 auth"
```

---

## Task 2: Write the migration SQL

**Files:**
- Create: `docs/migrations/2026-05-07-phase-0-auth-and-leaderboard.sql`

This is a single migration that does five things: creates `profiles`, enables RLS on `profiles`, truncates `leaderboard`, swaps `account_key` for `user_id`, and replaces the leaderboard RLS policies. It does NOT include the storage-bucket wipe — that's manual since SQL doesn't reach storage.

- [ ] **Step 1: Write the migration file**

Create `docs/migrations/2026-05-07-phase-0-auth-and-leaderboard.sql`:

```sql
-- ============================================================
-- Phase 0 migration: profiles + account-tagged leaderboard.
-- Run in the Supabase SQL editor as a single transaction.
--
-- BREAKING: this truncates the leaderboard table. Make sure the
-- holymog-faces storage bucket has also been emptied (manually,
-- via Supabase Studio) before running.
-- ============================================================

begin;

-- 1) profiles table.
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
  best_scan          jsonb,
  improvement_counts jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- 2) leaderboard breaking change: wipe + swap account_key for user_id.
truncate table leaderboard;

alter table leaderboard drop column if exists account_key;

alter table leaderboard
  add column user_id uuid not null references auth.users(id) on delete cascade;

alter table leaderboard
  add constraint leaderboard_one_row_per_user unique (user_id);

-- 3) Replace leaderboard RLS so the world can read and authenticated users
--    can write only their own row.
alter table leaderboard enable row level security;

drop policy if exists "leaderboard rows are world-readable" on leaderboard;
drop policy if exists "users can insert their own leaderboard row" on leaderboard;
drop policy if exists "users can update their own leaderboard row" on leaderboard;
drop policy if exists "users can delete their own leaderboard row" on leaderboard;

create policy "leaderboard rows are world-readable"
  on leaderboard for select
  using (true);

create policy "users can insert their own leaderboard row"
  on leaderboard for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own leaderboard row"
  on leaderboard for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own leaderboard row"
  on leaderboard for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
```

- [ ] **Step 2: Tell the user to run it (manual gate)**

Print:

> Two manual steps before continuing:
>
> 1. **Empty the `holymog-faces` storage bucket.** Supabase Studio → Storage → `holymog-faces` → select all → delete. (SQL doesn't reach storage; this has to be done in Studio.)
>
> 2. **Run the migration.** Paste `docs/migrations/2026-05-07-phase-0-auth-and-leaderboard.sql` into the Supabase SQL editor and execute. Verify with:
>    ```sql
>    select column_name from information_schema.columns
>    where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;
>    select column_name from information_schema.columns
>    where table_schema = 'public' and table_name = 'leaderboard' order by ordinal_position;
>    ```
>    Expected: `profiles` has 13 columns including `user_id`, `display_name`, `elo`, etc. `leaderboard` no longer has `account_key`; it has `user_id` instead.
>
> Confirm both steps before Task 3 proceeds.

- [ ] **Step 3: Commit the migration file**

```bash
git add docs/migrations/2026-05-07-phase-0-auth-and-leaderboard.sql
git commit -m "Phase 0 migration: profiles + account-tagged leaderboard"
```

---

## Task 3: Configure Supabase Auth providers (manual)

**Files:** none (this is a Supabase dashboard config step).

- [ ] **Step 1: Document the steps**

Print:

> In the Supabase dashboard for project `onnxwfkngqsoluevnanp`:
>
> **3a. Google OAuth**
> 1. Open **Authentication → Providers → Google → Enabled**.
> 2. From [Google Cloud Console](https://console.cloud.google.com/) create a new OAuth 2.0 Client ID (web application). Authorised redirect URI: `https://onnxwfkngqsoluevnanp.supabase.co/auth/v1/callback`.
> 3. Paste the Client ID + Client Secret into Supabase. Save.
>
> **3b. Apple OAuth**
> 1. **Authentication → Providers → Apple → Enabled**.
> 2. Apple Developer console → Sign In with Apple → create Service ID. Return URL: `https://onnxwfkngqsoluevnanp.supabase.co/auth/v1/callback`.
> 3. Generate a key, download the .p8 file, note the Key ID + Team ID.
> 4. Paste Service ID, Team ID, Key ID, and the .p8 contents into Supabase. Save.
>
> **3c. Email magic link**
> 1. **Authentication → Providers → Email → Enabled**, **Confirm email = false**, **Magic link = true**.
> 2. Default Supabase SMTP works for now.
>
> **3d. Site URL + Redirect URLs**
> 1. **Authentication → URL Configuration → Site URL** = `https://www.holymog.com`.
> 2. **Redirect URLs** add: `https://www.holymog.com/auth/callback`, `http://localhost:3002/auth/callback`.

This is a manual gate — do NOT proceed to Task 4 until the user confirms providers are configured.

---

## Task 4: Add auth env vars

**Files:**
- Modify: `.env.local` (gitignored)
- Vercel project env (manual)

- [ ] **Step 1: Find the service role key**

User opens Supabase dashboard → **Project Settings → API** → copies the **`service_role`** secret (NOT the anon key).

- [ ] **Step 2: Add to .env.local**

Append to `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
NEXT_PUBLIC_SUPABASE_URL=https://onnxwfkngqsoluevnanp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same anon key already in .env.local>
```

- [ ] **Step 3: Add to Vercel project env**

User adds the same three vars in Vercel → Project Settings → Environment Variables for both `Production` and `Preview` envs.

- [ ] **Step 4: Restart the dev server**

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN -t | xargs -r kill
npx next dev -p 3002 &
```

Manual gate — confirm vars are set in both local and Vercel before Task 5.

---

## Task 5: Server-side Supabase client

**Files:**
- Create: `lib/supabase-server.ts`

- [ ] **Step 1: Write the file**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client with the user's auth session bound from cookies.
 * Use in Route Handlers, Server Actions, and API routes.
 *
 * RLS applies — every query runs as the current user.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/supabase-server.ts
git commit -m "Add server-side Supabase client (auth-aware)"
```

---

## Task 6: Browser-side Supabase client

**Files:**
- Create: `lib/supabase-browser.ts`

- [ ] **Step 1: Write the file**

```ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/supabase-browser.ts
git commit -m "Add browser-side Supabase client"
```

---

## Task 7: Service-role admin client

**Files:**
- Create: `lib/supabase-admin.ts`

- [ ] **Step 1: Write the file**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client for privileged ops (e.g. creating a profile
 * row on first sign-in, before the user has any session). Bypasses RLS.
 *
 * Server-only. Never import this from a client component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/supabase-admin.ts
git commit -m "Add service-role Supabase admin client"
```

---

## Task 8: `useUser` hook

**Files:**
- Create: `hooks/useUser.ts`

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type { User } from '@supabase/supabase-js';

type State = { user: User | null; loading: boolean };

export function useUser() {
  const [state, setState] = useState<State>({ user: null, loading: true });

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    supabase.auth.getUser().then(({ data }) => {
      setState({ user: data.user, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await getSupabaseBrowser().auth.signOut();
  };

  return { ...state, signOut };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add hooks/useUser.ts
git commit -m "Add useUser hook"
```

---

## Task 9: `AuthModal` component

**Files:**
- Create: `components/AuthModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Contextual subtitle, e.g. "to battle" or "to submit". */
  context?: string;
  /** Where to redirect after successful auth. Defaults to current path. */
  next?: string;
};

export function AuthModal({ open, onClose, context, next }: Props) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const redirectTo = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback${
    next ? `?next=${encodeURIComponent(next)}` : ''
  }`;

  const signInWith = async (provider: 'google' | 'apple') => {
    setStatus('idle');
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    }
  };

  const sendMagicLink = async () => {
    if (!email.includes('@')) {
      setStatus('error');
      setErrorMsg('valid email required');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                sign in{context ? ` ${context}` : ''}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => signInWith('google')}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white hover:bg-white/[0.08]"
              >
                continue with google
              </button>
              <button
                type="button"
                onClick={() => signInWith('apple')}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white hover:bg-white/[0.08]"
              >
                continue with apple
              </button>

              <div className="my-2 flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {!emailMode ? (
                <button
                  type="button"
                  onClick={() => setEmailMode(true)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white hover:bg-white/[0.08]"
                >
                  <Mail size={14} aria-hidden /> email me a link
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                    autoComplete="email"
                  />
                  <button
                    type="button"
                    onClick={sendMagicLink}
                    disabled={status === 'sending' || status === 'sent'}
                    className="h-11 rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {status === 'sending' ? 'sending…' : status === 'sent' ? 'check your inbox' : 'send link'}
                  </button>
                </div>
              )}

              {status === 'error' && (
                <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
              )}
            </div>

            <p className="mt-6 text-[10px] leading-relaxed text-zinc-500">
              by signing in you agree to our terms and privacy policy
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/AuthModal.tsx
git commit -m "Add AuthModal component (OAuth + magic link)"
```

---

## Task 10: `/auth/callback` Route Handler

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/account';
  const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(errorParam)}`, url.origin),
    );
  }

  if (code) {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/?auth_error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (user) {
      const admin = getSupabaseAdmin();
      const { data: existing } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        const meta = user.user_metadata ?? {};
        const fromOauth =
          (typeof meta.full_name === 'string' && meta.full_name) ||
          (typeof meta.name === 'string' && meta.name) ||
          '';
        const emailLocal = (user.email ?? '').split('@')[0] ?? '';
        const displayName = (fromOauth || emailLocal || 'player').toLowerCase().slice(0, 24);

        await admin.from('profiles').insert({
          user_id: user.id,
          display_name: displayName,
        });
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/auth/callback/route.ts
git commit -m "Add /auth/callback route handler"
```

---

## Task 11: `/api/account/me` endpoint

**Files:**
- Create: `app/api/account/me/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the current authenticated user's profile + their leaderboard
 * row (if they have one). Used by the leaderboard modal to prefill.
 */
export async function GET() {
  const supabase = await getSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const [{ data: profile }, { data: entry }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, elo, peak_elo, matches_played, matches_won')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('leaderboard')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    profile: profile ?? null,
    entry: entry ?? null,
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/api/account/me/route.ts
git commit -m "Add GET /api/account/me endpoint"
```

---

## Task 12: Rewrite `/api/leaderboard` POST for auth-gated upsert

**Files:**
- Modify: `app/api/leaderboard/route.ts`

The existing handler uses `account_key` and a service-role client. Rewrite to require an authenticated session, upsert by `user_id`, and remove all key-related code paths. The GET stays identical.

- [ ] **Step 1: Replace the file body**

Open `app/api/leaderboard/route.ts` and replace the contents with:

```ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  FACES_BUCKET,
  getSupabase,
  type LeaderboardRow,
} from '@/lib/supabase';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getRatelimit } from '@/lib/ratelimit';
import { getTier } from '@/lib/tier';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 24;
const MAX_RESULTS = 100;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type PostBody = {
  name?: unknown;
  scores?: unknown;
  imageBase64?: unknown;
};

type Scores = {
  overall: number;
  sub: { jawline: number; eyes: number; skin: number; cheekbones: number };
};

type UploadedPhoto = { path: string; url: string };

function isInt0to100(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

function validateScores(s: unknown): Scores | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const sub = o.sub as Record<string, unknown> | undefined;
  if (
    !isInt0to100(o.overall) ||
    !sub ||
    !isInt0to100(sub.jawline) ||
    !isInt0to100(sub.eyes) ||
    !isInt0to100(sub.skin) ||
    !isInt0to100(sub.cheekbones)
  ) {
    return null;
  }
  return {
    overall: Math.round(o.overall),
    sub: {
      jawline: Math.round(sub.jawline as number),
      eyes: Math.round(sub.eyes as number),
      skin: Math.round(sub.skin as number),
      cheekbones: Math.round(sub.cheekbones as number),
    },
  };
}

async function uploadPhoto(
  supabase: SupabaseClient,
  imageBase64: string,
): Promise<UploadedPhoto | { error: string; status: number }> {
  const match = imageBase64.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/);
  if (!match) return { error: 'invalid_image', status: 400 };
  const mime = match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return { error: 'image_too_large', status: 413 };
  }
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const path = `${randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(FACES_BUCKET)
    .upload(path, buf, { contentType: mime, cacheControl: '3600' });
  if (uploadErr) return { error: uploadErr.message, status: 500 };
  const { data: pub } = supabase.storage.from(FACES_BUCKET).getPublicUrl(path);
  return { path, url: pub.publicUrl };
}

async function deletePhoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  await supabase.storage.from(FACES_BUCKET).remove([path]).catch(() => {});
}

export async function GET(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      entries: [] as LeaderboardRow[],
      hasMore: false,
      error: 'unconfigured',
    });
  }
  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const from = (page - 1) * MAX_RESULTS;
  const to = from + MAX_RESULTS - 1;

  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('overall', { ascending: false })
    .range(from, to);
  if (error) {
    return NextResponse.json(
      { entries: [], hasMore: false, error: error.message },
      { status: 500 },
    );
  }
  const entries = data ?? [];
  return NextResponse.json({
    entries,
    hasMore: entries.length === MAX_RESULTS,
    page,
  });
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? user.id;
    const result = await limiter.limit(`lb:${ip}`);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (rawName.length === 0 || rawName.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const name = rawName.replace(/\s+/g, ' ').toLowerCase();

  const scores = validateScores(body.scores);
  if (!scores) {
    return NextResponse.json({ error: 'invalid_scores' }, { status: 400 });
  }

  const tier = getTier(scores.overall).letter;
  const wantsPhoto =
    typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;

  // Look up existing row.
  const { data: existing, error: lookupErr } = await supabase
    .from('leaderboard')
    .select('id, image_path')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  if (wantsPhoto) {
    const upload = await uploadPhoto(supabase, body.imageBase64 as string);
    if ('error' in upload) {
      return NextResponse.json({ error: upload.error }, { status: upload.status });
    }
    imageUrl = upload.url;
    imagePath = upload.path;
  }

  if (existing) {
    // Update path.
    const { data, error } = await supabase
      .from('leaderboard')
      .update({
        name,
        overall: scores.overall,
        tier,
        jawline: scores.sub.jawline,
        eyes: scores.sub.eyes,
        skin: scores.sub.skin,
        cheekbones: scores.sub.cheekbones,
        image_url: imageUrl,
        image_path: imagePath,
      })
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) {
      if (imagePath) void deletePhoto(supabase, imagePath);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    void deletePhoto(supabase, existing.image_path);
    return NextResponse.json({ entry: data, isNew: false });
  }

  // Insert path.
  const { data, error } = await supabase
    .from('leaderboard')
    .insert({
      user_id: user.id,
      name,
      overall: scores.overall,
      tier,
      jawline: scores.sub.jawline,
      eyes: scores.sub.eyes,
      skin: scores.sub.skin,
      cheekbones: scores.sub.cheekbones,
      image_url: imageUrl,
      image_path: imagePath,
    })
    .select('*')
    .single();
  if (error) {
    if (imagePath) void deletePhoto(supabase, imagePath);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data, isNew: true });
}
```

- [ ] **Step 2: Update `LeaderboardRow` type**

Open `lib/supabase.ts` and replace the `LeaderboardRow` type:

```ts
export type LeaderboardRow = {
  id: string;
  user_id: string;
  name: string;
  overall: number;
  tier: string;
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
  image_url: string | null;
  image_path: string | null;
  created_at: string;
};
```

- [ ] **Step 3: Typecheck**

Run `npx tsc --noEmit`. Expected errors: callers of `LeaderboardRow.account_key` (LeaderboardModal, leaderboard cache, leaderboard page). They'll all be cleaned up in Tasks 13–15.

- [ ] **Step 4: Commit**

```bash
git add app/api/leaderboard/route.ts lib/supabase.ts
git commit -m "Auth-gate leaderboard POST, upsert on user_id"
```

(Typecheck will be red until Task 15. That's expected — see commit-as-you-go in subsequent tasks.)

---

## Task 13: Delete the legacy key files

**Files (deletes):**
- Delete: `lib/account.ts`
- Delete: `hooks/useAccount.ts`
- Delete: `components/AccountKeyCard.tsx`
- Delete: `app/api/account/[key]/route.ts`
- Delete: `app/api/account/[key]/` (empty dir after the file is gone)

- [ ] **Step 1: Delete the files**

```bash
rm lib/account.ts hooks/useAccount.ts components/AccountKeyCard.tsx app/api/account/[key]/route.ts
rmdir app/api/account/\[key\]
```

- [ ] **Step 2: Typecheck**

Run `npx tsc --noEmit`. Errors will reference the missing imports — every callsite gets fixed in Task 14.

- [ ] **Step 3: Don't commit yet**

Hold the commit until Task 14 wraps the cleanup.

---

## Task 14: Rewrite `LeaderboardModal` for the auth-gated world

**Files:**
- Modify: `components/LeaderboardModal.tsx`

This component currently uses `useAccount` and the masked-key chip and the paste-key form and AccountKeyCard — none of which exist now. The new behavior: only opens for signed-in users; on open, fetches `/api/account/me` to prefill name + previous-score comparison; submits with no key field.

- [ ] **Step 1: Replace the entire file**

Replace `components/LeaderboardModal.tsx` with:

```tsx
'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { FinalScores } from '@/types';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { useUser } from '@/hooks/useUser';
import { clearLeaderboardCache } from '@/lib/leaderboardCache';

const MAX_NAME_LEN = 24;

type Props = {
  open: boolean;
  scores: FinalScores;
  capturedImage: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

type PreviousEntry = {
  name: string;
  overall: number;
  tier: string;
  hasPhoto: boolean;
};

export function LeaderboardModal({
  open,
  scores,
  capturedImage,
  onClose,
  onSubmitted,
}: Props) {
  const { user, loading: userLoading } = useUser();

  const [name, setName] = useState('');
  const [includePhoto, setIncludePhoto] = useState(false);
  const [previous, setPrevious] = useState<PreviousEntry | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [showLowercaseHint, setShowLowercaseHint] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lowercaseHintTimerRef = useRef<number | null>(null);

  const triggerLowercaseHint = useCallback(() => {
    setShowLowercaseHint(true);
    if (lowercaseHintTimerRef.current !== null) {
      window.clearTimeout(lowercaseHintTimerRef.current);
    }
    lowercaseHintTimerRef.current = window.setTimeout(() => {
      setShowLowercaseHint(false);
      lowercaseHintTimerRef.current = null;
    }, 1800);
  }, []);

  // Reset state every open.
  useLayoutEffect(() => {
    if (!open) return;
    setName('');
    setIncludePhoto(false);
    setPrevious(null);
    setStatus({ kind: 'idle' });
    setShowLowercaseHint(false);
    if (lowercaseHintTimerRef.current !== null) {
      window.clearTimeout(lowercaseHintTimerRef.current);
      lowercaseHintTimerRef.current = null;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [open]);

  // Fetch /api/account/me to prefill once we know we're signed in.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { display_name?: string };
          entry?: {
            name: string;
            overall: number;
            tier: string;
            image_url: string | null;
          } | null;
        };
        if (cancelled) return;
        if (data.profile?.display_name) setName(data.profile.display_name);
        if (data.entry) {
          setPrevious({
            name: data.entry.name,
            overall: data.entry.overall,
            tier: data.entry.tier,
            hasPhoto: !!data.entry.image_url,
          });
          setIncludePhoto(!!data.entry.image_url);
        }
      } catch {
        // best-effort; modal still works without prefill
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return;
    setStatus({ kind: 'submitting' });
    try {
      const body: Record<string, unknown> = { name: trimmed, scores };
      if (includePhoto) body.imageBase64 = capturedImage;

      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        isNew?: boolean;
      };

      if (!res.ok) {
        const msg =
          data.error === 'rate_limited'
            ? 'too many submissions, slow down'
            : data.error === 'unauthenticated'
              ? 'session expired, sign in again'
              : data.error === 'leaderboard_unconfigured'
                ? 'leaderboard not yet available'
                : 'could not save, try again';
        setStatus({ kind: 'error', message: msg });
        return;
      }

      clearLeaderboardCache();
      onSubmitted?.();
      setStatus({ kind: 'success' });
      window.setTimeout(onClose, 900);
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  }, [name, scores, includePhoto, capturedImage, onSubmitted, onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit();
  };

  const newScore = scores.overall;
  const newTier = getTier(newScore);
  const delta = previous ? newScore - previous.overall : 0;
  const submitLabel = previous
    ? delta < 0
      ? 'Replace anyway'
      : 'Replace'
    : 'Submit';
  const submitDisabled =
    status.kind === 'submitting' ||
    status.kind === 'success' ||
    name.trim().length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="lb-title" className="text-base font-semibold text-white">
                Add to leaderboard
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {userLoading ? (
              <p className="text-sm text-zinc-500">loading…</p>
            ) : !user ? (
              <p className="text-sm text-zinc-300">
                sign in to submit. close this modal and tap "sign in" in the header.
              </p>
            ) : (
              <>
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  you · {name || 'set a name'}
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const lowered = raw.toLowerCase();
                    if (raw !== lowered) triggerLowercaseHint();
                    setName(lowered.slice(0, MAX_NAME_LEN));
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="your name"
                  maxLength={MAX_NAME_LEN}
                  className="mb-1 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                  autoComplete="off"
                  autoCapitalize="none"
                  aria-label="Name"
                />
                <p
                  className="mb-3 text-[11px] transition-colors duration-300"
                  style={{ color: showLowercaseHint ? '#facc15' : '#71717a' }}
                >
                  {showLowercaseHint ? 'names are lowercase' : 'e.g. brian gao'}
                </p>

                <button
                  type="button"
                  onClick={() => setIncludePhoto((v) => !v)}
                  aria-pressed={includePhoto}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                      includePhoto
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-white/30 bg-transparent'
                    }`}
                    aria-hidden
                  >
                    {includePhoto && (
                      <Check size={13} strokeWidth={3} className="text-black" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm text-white">
                      also share my photo
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      shows next to your name on the board
                    </span>
                  </span>
                  {includePhoto && (
                    <span className="overflow-hidden rounded-full border border-white/15">
                      <img
                        src={capturedImage}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 object-cover"
                      />
                    </span>
                  )}
                </button>

                {previous && (
                  <ComparisonBlock
                    prevOverall={previous.overall}
                    prevTierLetter={previous.tier}
                    newOverall={newScore}
                    newTierLetter={newTier.letter}
                    delta={delta}
                  />
                )}

                {status.kind === 'error' && (
                  <p className="mb-3 text-xs text-red-400">{status.message}</p>
                )}
                {status.kind === 'success' && (
                  <p className="mb-3 text-xs text-emerald-400">
                    {previous ? 'updated, see you on the board' : 'added, see you on the board'}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ touchAction: 'manipulation' }}
                    className="h-11 flex-1 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitDisabled}
                    style={{ touchAction: 'manipulation' }}
                    className="h-11 flex-1 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {status.kind === 'submitting' ? 'saving…' : submitLabel}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ComparisonBlock({
  prevOverall,
  prevTierLetter,
  newOverall,
  newTierLetter,
  delta,
}: {
  prevOverall: number;
  prevTierLetter: string;
  newOverall: number;
  newTierLetter: string;
  delta: number;
}) {
  const prevColor = getScoreColor(prevOverall);
  const newColor = getScoreColor(newOverall);
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#a1a1aa';

  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      <Cell label="previous" score={prevOverall} tier={prevTierLetter} color={prevColor} />
      <Cell
        label="this scan"
        score={newOverall}
        tier={newTierLetter}
        color={newColor}
        accentRight={
          <span
            className="ml-1 font-num text-[11px] font-semibold tabular-nums"
            style={{ color: deltaColor }}
          >
            {arrow} {delta > 0 ? '+' : ''}
            {delta}
          </span>
        }
      />
    </div>
  );
}

function Cell({
  label,
  score,
  tier,
  color,
  accentRight,
}: {
  label: string;
  score: number;
  tier: string;
  color: string;
  accentRight?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className="font-num text-2xl font-extrabold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-zinc-400 normal-case">{tier}</span>
        {accentRight}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run `npx tsc --noEmit`. Expected: clean. (The deletes from Task 13 + this rewrite together remove every key reference.)

- [ ] **Step 3: Commit Tasks 13 + 14 together**

```bash
git add -u
git commit -m "Rewrite LeaderboardModal for account-gated submission; remove legacy key code"
```

---

## Task 15: Auth-gate the "add to leaderboard" entrypoint on `/`

**Files:**
- Modify: `app/page.tsx`

When a logged-out user taps "add to leaderboard" on the complete screen, open the AuthModal instead of LeaderboardModal. After they sign in, `?next=/` brings them back; they can re-open the modal manually.

- [ ] **Step 1: Add the auth gate**

In `app/page.tsx`, find the `onAddToLeaderboard` handler / button wiring near the `setLeaderboardOpen` calls. Wrap the open with an auth check using `useUser`:

```tsx
import { useUser } from '@/hooks/useUser';
import { AuthModal } from '@/components/AuthModal';

// ... inside Home():
const { user } = useUser();
const [authOpen, setAuthOpen] = useState(false);

// ...
const onAddToLeaderboard = () => {
  if (user) {
    setLeaderboardOpen(true);
  } else {
    setAuthOpen(true);
  }
};

// in the JSX:
<AuthModal open={authOpen} onClose={() => setAuthOpen(false)} context="to submit" next="/" />
```

(Replace the existing `onAddToLeaderboard` callback used by the LeaderboardButton.)

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/page.tsx
git commit -m "Auth-gate leaderboard submission entrypoint on /"
```

---

## Task 16: `AccountAvatar` component

**Files:**
- Create: `components/AccountAvatar.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { AuthModal } from './AuthModal';

type Props = {
  next?: string;
  context?: string;
};

export function AccountAvatar({ next, context }: Props) {
  const { user, loading } = useUser();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return <span className="h-8 w-8 rounded-full bg-white/[0.04]" aria-hidden />;
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-white hover:bg-white/[0.07]"
        >
          sign in
        </button>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          next={next}
          context={context}
        />
      </>
    );
  }

  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email ||
    'p';
  const initial = name.charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;

  return (
    <Link
      href="/account"
      aria-label="account"
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}, 55%, 38%)` }}
    >
      <span className="normal-case">{initial}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/AccountAvatar.tsx
git commit -m "Add AccountAvatar component"
```

---

## Task 17: `AppHeader` wrapper

**Files:**
- Create: `components/AppHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Link from 'next/link';
import { AccountAvatar } from './AccountAvatar';

type Props = {
  authNext?: string;
  authContext?: string;
};

export function AppHeader({ authNext, authContext }: Props) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between bg-black/70 px-5 py-3 backdrop-blur"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
    >
      <Link
        href="/"
        className="font-mono text-sm lowercase text-white hover:opacity-80"
      >
        holymog
      </Link>
      <AccountAvatar next={authNext} context={authContext} />
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/AppHeader.tsx
git commit -m "Add AppHeader wrapper"
```

---

## Task 18: Account stats / history placeholders

**Files:**
- Create: `components/AccountStatsTab.tsx`
- Create: `components/AccountHistoryTab.tsx`

- [ ] **Step 1: Write `AccountStatsTab.tsx`**

```tsx
'use client';

export function AccountStatsTab() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="text-4xl">📊</div>
      <div>
        <p className="text-sm text-white">no stats yet</p>
        <p className="mt-1 text-xs text-zinc-500">
          play public battles to start earning ELO and tracking wins. your best
          scan&apos;s full breakdown will show up here once you scan as a signed-in user.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `AccountHistoryTab.tsx`**

```tsx
'use client';

export function AccountHistoryTab() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="text-4xl">⌛</div>
      <div>
        <p className="text-sm text-white">history coming soon</p>
        <p className="mt-1 text-xs text-zinc-500">
          your past battles will show up here with opponent, ELO change, and result.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/AccountStatsTab.tsx components/AccountHistoryTab.tsx
git commit -m "Add account stats + history placeholders"
```

---

## Task 19: `AccountSettingsTab` (display name + sign out only)

**Files:**
- Create: `components/AccountSettingsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const MAX_NAME_LEN = 24;

export function AccountSettingsTab() {
  const { user, signOut } = useUser();
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getSupabaseBrowser()
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.display_name) setName(data.display_name);
    })();
  }, [user]);

  const saveName = async () => {
    const trimmed = name.trim().toLowerCase().slice(0, MAX_NAME_LEN);
    if (!trimmed || !user) return;
    setSavingName(true);
    setNameStatus('idle');
    const { error } = await getSupabaseBrowser()
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('user_id', user.id);
    setSavingName(false);
    if (error) {
      setNameStatus('error');
    } else {
      setNameStatus('saved');
      setName(trimmed);
      window.setTimeout(() => setNameStatus('idle'), 1500);
    }
  };

  if (!user) {
    return <p className="text-sm text-zinc-500">not signed in</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <label
          htmlFor="display-name"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) =>
              setName(e.target.value.toLowerCase().slice(0, MAX_NAME_LEN))
            }
            maxLength={MAX_NAME_LEN}
            className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
            autoCapitalize="none"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={savingName}
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-50"
          >
            {savingName ? 'saving…' : 'save'}
          </button>
        </div>
        {nameStatus === 'saved' && (
          <p className="text-[11px] text-emerald-400">saved</p>
        )}
        {nameStatus === 'error' && (
          <p className="text-[11px] text-red-400">could not save</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <button
          type="button"
          onClick={signOut}
          className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-white hover:bg-white/[0.07]"
        >
          sign out
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/AccountSettingsTab.tsx
git commit -m "Add AccountSettingsTab"
```

---

## Task 20: `/account` page

**Files:**
- Create: `app/account/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client';

import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { AccountStatsTab } from '@/components/AccountStatsTab';
import { AccountHistoryTab } from '@/components/AccountHistoryTab';
import { AccountSettingsTab } from '@/components/AccountSettingsTab';

type Tab = 'stats' | 'history' | 'settings';

export default function AccountPage() {
  const { user, loading } = useUser();
  const [tab, setTab] = useState<Tab>('stats');

  if (loading) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <main className="mx-auto w-full max-w-md px-5 py-8 text-sm text-zinc-500">
          loading…
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <main className="mx-auto w-full max-w-md px-5 py-8">
          <p className="text-sm text-white">sign in to see your account</p>
          <AuthModal open onClose={() => {}} next="/account" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        <h1 className="mb-4 text-2xl font-bold text-white">account</h1>

        <nav className="mb-4 flex gap-2 text-sm">
          {(['stats', 'history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 transition-colors ${
                tab === t
                  ? 'bg-white text-black'
                  : 'border border-white/15 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === 'stats' && <AccountStatsTab />}
        {tab === 'history' && <AccountHistoryTab />}
        {tab === 'settings' && <AccountSettingsTab />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/account/page.tsx
git commit -m "Add /account page"
```

---

## Task 21: `AppHeader` on `/leaderboard`

**Files:**
- Modify: `app/leaderboard/page.tsx`

- [ ] **Step 1: Add the header**

At the top of the file, add:

```tsx
import { AppHeader } from '@/components/AppHeader';
```

In the rendered JSX, replace the existing inner `<header>` (the one with the back button + wordmark) with `<AppHeader authNext="/leaderboard" />`. Keep the rest of the layout unchanged.

- [ ] **Step 2: Typecheck + visual smoke**

```bash
npx tsc --noEmit
```

Manually open `http://localhost:3002/leaderboard`. Confirm the header avatar shows "sign in" pill (logged out) or initial avatar (logged in).

- [ ] **Step 3: Commit**

```bash
git add app/leaderboard/page.tsx
git commit -m "Add AppHeader to /leaderboard"
```

---

## Task 22: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update env vars section**

Add these to the documented vars in `README.md`:

```bash
# Required for auth (Phase 0+)
NEXT_PUBLIC_SUPABASE_URL=                # mirror of SUPABASE_URL for the browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=           # mirror of SUPABASE_ANON_KEY for the browser
SUPABASE_SERVICE_ROLE_KEY=               # service role key, server-only
```

- [ ] **Step 2: Note the breaking change**

Add a short paragraph near the top of the README:

> ## Phase 0 (in progress, post 2026-05-07)
>
> Phase 0 introduces accounts. The 8-char Crockford key system is **fully removed** — leaderboard rows are now tagged by `user_id` and submitting requires sign-in. Existing leaderboard rows from the key era are wiped on the Phase 0 deploy. See `docs/superpowers/specs/2026-05-07-mog-battles-and-accounts-design.md` for the full design and `docs/superpowers/plans/2026-05-07-mog-battles-phase-0-auth-and-accounts.md` for the build plan.

- [ ] **Step 3: Bump phasing roadmap**

```md
### Phasing roadmap

The Mog Battles + Accounts feature is being built in 6 phases. Phase 0 (auth + accounts + account-tagged leaderboard) is in progress.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document Phase 0 in README"
```

---

## Task 23: Smoke test end-to-end

**Files:** none

- [ ] **Step 1: Verify dev server**

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN | head
```
Expect a node process. If not, start it.

- [ ] **Step 2: Verify the migration ran**

In Supabase Studio SQL editor:

```sql
select count(*) from profiles;          -- 0 if no one's signed up
select count(*) from leaderboard;       -- 0 (was wiped)
select column_name from information_schema.columns
where table_schema='public' and table_name='leaderboard' order by ordinal_position;
```

Expected: `leaderboard` has `user_id` and no `account_key`. Pause if any are off.

- [ ] **Step 3: Test sign-in via Google**

In a fresh incognito window, open `http://localhost:3002/account`. Auth modal opens. Click "continue with google", authorize, get redirected to `/account`. Confirm:
- Header avatar shows your initial.
- Settings tab shows your display name (lowercased Google name, editable).
- `select * from profiles` in Supabase shows your row with `user_id` and `display_name`.

- [ ] **Step 4: Test magic link**

Sign out, then click "email me a link" → enter an email → "send link" → status changes to "check your inbox" → click the email link → redirected to `/account` signed in. Confirm a new profile row was created (or existing one matched).

- [ ] **Step 5: Test leaderboard submission as a signed-in user**

Navigate to `/`. Run a scan. Click "add to leaderboard". Modal opens with name prefilled from profile, no key UI anywhere. Submit. Confirm:
- Modal shows success then auto-closes.
- `select * from leaderboard` in Supabase shows your row with `user_id` matching `auth.users.id`.

- [ ] **Step 6: Test re-submission updates the same row**

Run another scan with a different score. Click "add to leaderboard" again. Modal shows the previous-vs-new comparison block. Click Replace. Confirm `select * from leaderboard` still has exactly one row for your user_id, with the new overall score.

- [ ] **Step 7: Test logged-out leaderboard gating**

Sign out. Run a scan. Click "add to leaderboard". The auth modal opens with title "sign in to submit". Confirm no fetch to `/api/leaderboard` was made (Network tab shows the auth modal alone). Cancel the modal — the complete view stays put.

- [ ] **Step 8: Test sign-out preserves anonymity**

After sign out, confirm:
- Header avatar reverts to "sign in" pill.
- The user can still scan freely.
- localStorage no longer has `holymog-account-key` (the legacy key was deleted in Task 13's UI rewrite).

- [ ] **Step 9: Push to production**

```bash
git push origin main
```

Phase 0 is shipped.

---

## Self-review

**Spec coverage:**
- §5 (auth flow, simplified) — Tasks 9, 10.
- §6 (profiles + leaderboard schema, breaking change) — Task 2.
- §11.1 (`/api/account/me`) — Task 11.
- §11.3 (auth-gated `POST /api/leaderboard`) — Task 12.
- §10 (account page settings tab without key UI) — Task 19.
- §12.1 (logged-out user submitting hits auth modal) — Tasks 9 + 15.
- AppHeader on non-`/scan` routes — Tasks 17 + 21.
- Stats/history placeholders — Task 18.
- Removed key files cleanup — Task 13.
- LeaderboardModal rewritten without keys — Task 14.

**Spec items deferred to later phases (intentional):**
- Stats tab actual implementation → Phase 3.
- History tab → Phase 5.
- Home page restructure → Phase 1.
- Battles entirely → Phases 2–4.

**Type consistency:** `LeaderboardRow` updated in Task 12 step 2 — no leftover `account_key` references after Task 13/14 lands. `useUser` returns `{ user, loading, signOut }` consistently. `AccountAvatar` and `AppHeader` props match across components.

**Placeholder scan:** No "TBD"/"TODO"/"implement later". All code blocks complete.

**Scope check:** Each task is an isolated unit. The plan ends in a deployable state where signed-in users can manage accounts and submit to the leaderboard, and battles don't exist yet (matches spec's Phase 0 boundary).
