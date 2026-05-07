# Mog Battles — Phase 0: Auth + Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth–backed accounts (Google + Apple OAuth + email magic link), the `profiles` table, the `/account` page, and the `/api/account/link-key` endpoint. Anonymous-with-key flows continue to work unchanged. No battles yet — Phase 0 is pure infrastructure.

**Architecture:** All auth flows through Supabase Auth (already plumbed for our Postgres). `@supabase/ssr` gives us Next.js 16-compatible server + browser clients. A dedicated server callback route (`/auth/callback`) handles OAuth code exchange and magic-link verification, creates the `profiles` row on first sign-in, and silently auto-migrates any existing `holymog-account-key` from localStorage. The `/account` page is a three-tab UI; only the Settings tab has functionality in this phase.

**Tech Stack:** Next.js 16 App Router, React 19.2, Supabase Auth + Postgres, `@supabase/ssr`, Tailwind v4, framer-motion (existing).

**Phasing roadmap (full picture, see spec for detail):**
- **Phase 0 (this plan)** — Auth + Profiles + `/account` page. No battles.
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
| `app/auth/callback/route.ts` | Handles OAuth code exchange + magic-link token verification, creates profile, runs key auto-migration, redirects. |
| `app/account/page.tsx` | The `/account` page shell: header, tabs, sign-out. Renders one of three tab components. |
| `app/api/account/link-key/route.ts` | POST endpoint to link a key to the current authenticated profile. |
| `components/AuthModal.tsx` | The three-button auth modal (Google / Apple / magic link). Opens on demand, dismissable. |
| `components/AppHeader.tsx` | Wordmark + avatar/sign-in pill. Used on `/leaderboard` and `/account` in Phase 0; expands in Phase 1. |
| `components/AccountAvatar.tsx` | The avatar circle (or sign-in pill if logged out). Has long-press / dropdown for sign out. |
| `components/AccountStatsTab.tsx` | Stats tab body. Phase 0 = empty-state placeholder. Real implementation in Phase 3. |
| `components/AccountHistoryTab.tsx` | History tab body. Phase 0 = "coming soon" placeholder. |
| `components/AccountSettingsTab.tsx` | Settings tab body: editable display name, paste-key form, sign out. |
| `components/PasteKeyForm.tsx` | Reusable paste-key input + submit. Shared by AccountSettingsTab and post-auth toast. |
| `docs/migrations/2026-05-07-phase-0-profiles.sql` | SQL migration: `profiles` table + RLS policies. User runs in Supabase SQL editor. |

**Modified files:**

| Path | Changes |
|---|---|
| `package.json` | Add `@supabase/ssr` dependency. |
| `app/leaderboard/page.tsx` | Wrap content with `<AppHeader />` so signed-in users see their avatar. |
| `README.md` | Add Phase 0 to the documented architecture; bump phasing roadmap. |

**Routes touched: only `/leaderboard`, `/account`, `/auth/callback`, `/api/account/link-key`. The `/`, `/scan`, `/mog` routes are untouched in Phase 0 (they get reorganised in Phase 1).**

**Testing approach:** This codebase has no test suite. Following the existing pattern, verification per task is `npx tsc --noEmit` for compile correctness + manual smoke testing in the browser for UI tasks. The dev server should be running at `localhost:3002` throughout.

---

## Task 1: Install `@supabase/ssr`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install @supabase/ssr`
Expected: package added at `^0.5.x` or similar; no warnings.

- [ ] **Step 2: Verify install**

Run: `cat package.json | grep ssr`
Expected: line `"@supabase/ssr": "^x.y.z"` appears under dependencies.

- [ ] **Step 3: Typecheck baseline**

Run: `npx tsc --noEmit`
Expected: no errors (the package exports types out of the box).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @supabase/ssr for Next 16 auth"
```

---

## Task 2: Add migration SQL for `profiles` table

**Files:**
- Create: `docs/migrations/2026-05-07-phase-0-profiles.sql`

- [ ] **Step 1: Write the migration file**

Create `docs/migrations/2026-05-07-phase-0-profiles.sql`:

```sql
-- Phase 0 migration: profiles table + RLS.
-- Run this in the Supabase SQL editor as a one-shot.

create table profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text not null,
  account_key        text references leaderboard(account_key),
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

create unique index profiles_account_key_idx
  on profiles (account_key) where account_key is not null;

-- RLS
alter table profiles enable row level security;

-- Anyone authenticated can read any profile (display name + ELO visible to opponents).
create policy "profiles are readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

-- Only the user themselves can insert/update their own row.
create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at trigger
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
```

- [ ] **Step 2: Tell the user to run it**

Print this message in the implementation summary so the user runs the SQL manually:

> Run the contents of `docs/migrations/2026-05-07-phase-0-profiles.sql` in the Supabase SQL editor. After it succeeds, run this to verify:
> ```sql
> select column_name from information_schema.columns
> where table_name = 'profiles' order by ordinal_position;
> ```
> Expected: 14 columns including `user_id`, `display_name`, `account_key`, `elo`, `improvement_counts`, etc.

- [ ] **Step 3: Commit the SQL**

```bash
git add docs/migrations/2026-05-07-phase-0-profiles.sql
git commit -m "Add Phase 0 migration: profiles table"
```

---

## Task 3: Configure Supabase Auth providers (manual)

**Files:** none (this is a Supabase dashboard config step).

- [ ] **Step 1: Document the steps**

Print this for the user. No code:

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
> 2. Default Supabase SMTP works for now. (Optional later: connect Resend for branded sender + better deliverability.)
>
> **3d. Site URL + Redirect URLs**
> 1. **Authentication → URL Configuration → Site URL** = `https://www.holymog.com`.
> 2. **Redirect URLs** add: `https://www.holymog.com/auth/callback`, `http://localhost:3002/auth/callback`.

This is a manual gate — do NOT proceed to Task 4 until the user confirms providers are configured.

---

## Task 4: Add Supabase Auth env var

**Files:**
- Modify: `.env.local` (gitignored)

- [ ] **Step 1: Find the service role key**

User opens Supabase dashboard → **Project Settings → API** → copies the **`service_role`** secret (NOT the anon key).

- [ ] **Step 2: Add to .env.local**

Append to `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   # paste from Supabase dashboard
```

- [ ] **Step 3: Restart the dev server**

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN -t | xargs -r kill
npx next dev -p 3002 &
```

Verify: `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3002` returns `200`.

This is a manual gate — do NOT proceed until env is set.

---

## Task 5: Create server-side Supabase client (auth-aware)

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-server.ts
git commit -m "Add server-side Supabase client (auth-aware)"
```

---

## Task 6: Create browser-side Supabase client (auth-aware)

**Files:**
- Create: `lib/supabase-browser.ts`

- [ ] **Step 1: Write the file**

```ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser-side Supabase client. Singleton — reuses the same instance across
 * the React tree so the auth listener doesn't fire multiple times.
 */
export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
```

- [ ] **Step 2: Add NEXT_PUBLIC_ env vars**

`SUPABASE_URL` and `SUPABASE_ANON_KEY` need browser-readable mirrors. Append to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://onnxwfkngqsoluevnanp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same anon key already in .env.local>
```

- [ ] **Step 3: Restart dev server, typecheck**

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN -t | xargs -r kill
npx next dev -p 3002 &
npx tsc --noEmit
```
Expected: typecheck clean, dev server up.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase-browser.ts
git commit -m "Add browser-side Supabase client"
```

---

## Task 7: Create service-role admin client

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-admin.ts
git commit -m "Add service-role Supabase admin client"
```

---

## Task 8: Add `useUser` hook

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useUser.ts
git commit -m "Add useUser hook"
```

---

## Task 9: Build `AuthModal` component

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
  /** Contextual subtitle, e.g. "to battle". */
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AuthModal.tsx
git commit -m "Add AuthModal component (OAuth + magic link)"
```

---

## Task 10: Build `/auth/callback` Route Handler

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handles both OAuth code exchange and magic-link verification. On first sign-in
 * for a given user, creates the matching `profiles` row. Redirects to `?next=`
 * if provided, else `/account`.
 */
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

    // Get the freshly authenticated user.
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (user) {
      // Create profile if first time.
      const admin = getSupabaseAdmin();
      const { data: existing } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        const meta = user.user_metadata ?? {};
        const fromOauth =
          (typeof meta.name === 'string' && meta.name) ||
          (typeof meta.full_name === 'string' && meta.full_name) ||
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "Add /auth/callback route handler"
```

---

## Task 11: Build `/api/account/link-key` endpoint

**Files:**
- Create: `app/api/account/link-key/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isValidAccountKey, normaliseAccountKey } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { key?: unknown };

export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawKey = typeof body.key === 'string' ? body.key : '';
  if (!rawKey) {
    return NextResponse.json({ linked: false });
  }
  const key = normaliseAccountKey(rawKey);
  if (!isValidAccountKey(key)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Is this key already on a profile?
  const { data: existingOwner } = await admin
    .from('profiles')
    .select('user_id')
    .eq('account_key', key)
    .maybeSingle();

  if (existingOwner && existingOwner.user_id !== user.id) {
    return NextResponse.json({ error: 'key_owned_by_other' }, { status: 409 });
  }
  if (existingOwner && existingOwner.user_id === user.id) {
    return NextResponse.json({ linked: true, alreadyLinked: true, key });
  }

  // Update the user's profile.account_key.
  const { error: updateErr } = await admin
    .from('profiles')
    .update({ account_key: key })
    .eq('user_id', user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ linked: true, key });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/account/link-key/route.ts
git commit -m "Add POST /api/account/link-key endpoint"
```

---

## Task 12: Build `PasteKeyForm` reusable component

**Files:**
- Create: `components/PasteKeyForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import {
  ACCOUNT_KEY_LENGTH,
  isValidAccountKey,
  normaliseAccountKey,
} from '@/lib/account';

type Props = {
  /** Called on success with the linked key. */
  onLinked: (key: string) => void;
  /** Optional initial key for re-display. */
  initialValue?: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; key: string };

export function PasteKeyForm({ onLinked, initialValue = '' }: Props) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const submit = async () => {
    const key = normaliseAccountKey(value);
    if (!isValidAccountKey(key)) {
      setStatus({ kind: 'error', message: '8 letters or numbers' });
      return;
    }
    setStatus({ kind: 'submitting' });
    try {
      const res = await fetch('/api/account/link-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        linked?: boolean;
        alreadyLinked?: boolean;
        error?: string;
        key?: string;
      };
      if (!res.ok) {
        const msg =
          data.error === 'key_owned_by_other'
            ? 'that key belongs to another account'
            : data.error === 'invalid_key'
              ? 'invalid key format'
              : data.error === 'unauthenticated'
                ? 'sign in first'
                : 'could not link key';
        setStatus({ kind: 'error', message: msg });
        return;
      }
      if (data.linked && data.key) {
        // persist locally so leaderboard modal flows pick it up
        try {
          window.localStorage.setItem('holymog-account-key', data.key);
        } catch {
          // ignore
        }
        setStatus({ kind: 'success', key: data.key });
        onLinked(data.key);
      }
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = normaliseAccountKey(e.target.value).slice(0, ACCOUNT_KEY_LENGTH);
            setValue(next);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder="ABCD1234"
          maxLength={ACCOUNT_KEY_LENGTH}
          className="flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-sm tracking-[0.2em] text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none uppercase placeholder:uppercase"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Account key"
        />
        <button
          type="button"
          onClick={submit}
          disabled={
            status.kind === 'submitting' || value.length !== ACCOUNT_KEY_LENGTH
          }
          className="rounded-lg bg-white px-3 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-50"
        >
          {status.kind === 'submitting' ? '…' : 'link'}
        </button>
      </div>
      {status.kind === 'error' && (
        <p className="text-[11px] text-red-400">{status.message}</p>
      )}
      {status.kind === 'success' && (
        <p className="text-[11px] text-emerald-400">linked: {status.key}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/PasteKeyForm.tsx
git commit -m "Add PasteKeyForm reusable component"
```

---

## Task 13: Build `AccountAvatar` component

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
  /** Where to come back to after sign-in (defaults to current path). */
  next?: string;
  /** Subtitle, e.g. "to battle". */
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

  // Logged in: small circular avatar (initials), tap → /account.
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AccountAvatar.tsx
git commit -m "Add AccountAvatar component"
```

---

## Task 14: Build `AppHeader` wrapper

**Files:**
- Create: `components/AppHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Link from 'next/link';
import { AccountAvatar } from './AccountAvatar';

type Props = {
  /** Where AccountAvatar's auth modal should send the user post-sign-in. */
  authNext?: string;
  /** Subtitle for the auth modal. */
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "Add AppHeader wrapper"
```

---

## Task 15: Build `AccountStatsTab` placeholder

**Files:**
- Create: `components/AccountStatsTab.tsx`

- [ ] **Step 1: Write the component**

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AccountStatsTab.tsx
git commit -m "Add AccountStatsTab placeholder"
```

---

## Task 16: Build `AccountHistoryTab` placeholder

**Files:**
- Create: `components/AccountHistoryTab.tsx`

- [ ] **Step 1: Write the component**

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AccountHistoryTab.tsx
git commit -m "Add AccountHistoryTab placeholder"
```

---

## Task 17: Build `AccountSettingsTab`

**Files:**
- Create: `components/AccountSettingsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { PasteKeyForm } from './PasteKeyForm';

const MAX_NAME_LEN = 24;

type Profile = {
  display_name: string;
  account_key: string | null;
};

export function AccountSettingsTab() {
  const { user, signOut } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getSupabaseBrowser()
        .from('profiles')
        .select('display_name, account_key')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setName(data.display_name);
      }
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
      setProfile((p) => (p ? { ...p, display_name: trimmed } : p));
      window.setTimeout(() => setNameStatus('idle'), 1500);
    }
  };

  if (!user) {
    return <p className="text-sm text-zinc-500">not signed in</p>;
  }

  const masked = profile?.account_key
    ? `${profile.account_key.slice(0, 4)}••••`
    : null;

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
            disabled={savingName || name === profile?.display_name}
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

      <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            linked key
          </p>
          {masked ? (
            <p className="mt-1 font-mono text-sm text-white normal-case">
              {masked}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">no key linked yet</p>
          )}
        </div>
        <PasteKeyForm
          onLinked={(key) =>
            setProfile((p) => (p ? { ...p, account_key: key } : p))
          }
        />
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AccountSettingsTab.tsx
git commit -m "Add AccountSettingsTab"
```

---

## Task 18: Build `/account` page

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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/account/page.tsx
git commit -m "Add /account page"
```

---

## Task 19: Wire same-device key auto-migration

**Files:**
- Modify: `app/auth/callback/route.ts` (server side cannot read localStorage; auto-migration must happen client-side after redirect).
- Create: `app/account/AutoMigrateOnce.tsx` — small client island that runs once on mount.

- [ ] **Step 1: Create the AutoMigrateOnce component**

```tsx
'use client';

import { useEffect, useRef } from 'react';

/**
 * On first render after sign-in, if localStorage has an account key, link it
 * to the current profile. Idempotent — server returns alreadyLinked if it's
 * already on the profile.
 */
export function AutoMigrateOnce() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    let key: string | null = null;
    try {
      key = window.localStorage.getItem('holymog-account-key');
    } catch {
      return;
    }
    if (!key) return;
    void fetch('/api/account/link-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).catch(() => {
      // best effort
    });
  }, []);
  return null;
}
```

- [ ] **Step 2: Mount it on the account page**

Edit `app/account/page.tsx` — add an import and render `<AutoMigrateOnce />` inside the signed-in branch:

```tsx
import { AutoMigrateOnce } from './AutoMigrateOnce';

// ... inside the signed-in `return (...)`:
<main className="mx-auto w-full max-w-md px-5 py-6">
  <AutoMigrateOnce />
  {/* ...rest unchanged... */}
</main>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/account/AutoMigrateOnce.tsx app/account/page.tsx
git commit -m "Auto-migrate localStorage key on /account mount"
```

---

## Task 20: Add `AppHeader` to `/leaderboard`

**Files:**
- Modify: `app/leaderboard/page.tsx`

- [ ] **Step 1: Add the header**

Replace the existing `<header>` block (lines starting with `<header className="mx-auto flex w-full max-w-md…">`) with:

```tsx
import { AppHeader } from '@/components/AppHeader';

// ... inside the component:
return (
  <div
    className="relative min-h-dvh bg-black px-5 pb-12"
    style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
  >
    <AppHeader authNext="/leaderboard" />

    <main className="mx-auto w-full max-w-md py-4">
      {/* ...existing main content unchanged... */}
    </main>
  </div>
);
```

Remove the now-redundant inner `<header>` with the back button and wordmark; the AppHeader provides them. (Actually — the leaderboard's "back" button matters; keep it. Move it into a row below AppHeader, or accept that the AppHeader's `holymog` link is the back affordance. Simplest: drop the old header entirely, since AppHeader's wordmark links to `/`.)

- [ ] **Step 2: Typecheck + visual smoke**

```bash
npx tsc --noEmit
```
Expected: clean.

Manually open `http://localhost:3002/leaderboard` and confirm the header avatar shows "sign in" pill (logged-out) or initial avatar (logged-in).

- [ ] **Step 3: Commit**

```bash
git add app/leaderboard/page.tsx
git commit -m "Add AppHeader to /leaderboard"
```

---

## Task 21: Add `AppHeader` env var helper to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update env var section**

Edit the "Environment variables" section in `README.md` to add the new vars:

```bash
# Required for auth (Phase 0+)
NEXT_PUBLIC_SUPABASE_URL=                # mirror of SUPABASE_URL for the browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=           # mirror of SUPABASE_ANON_KEY for the browser
SUPABASE_SERVICE_ROLE_KEY=               # service role key, server-only, used to create profiles
```

Also update the "Optional infrastructure" table — Supabase becomes Required for full functionality (anon access, leaderboard) and the service role becomes additionally required for accounts/battles.

- [ ] **Step 2: Bump phasing roadmap**

Add a short note near the bottom of the README:

```md
### Phasing roadmap

The Mog Battles + Accounts feature is being built in 6 phases (see
`docs/superpowers/specs/2026-05-07-mog-battles-and-accounts-design.md`).
Phase 0 (auth + accounts + /account page) is in progress.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Phase 0 env vars and phasing in README"
```

---

## Task 22: Smoke test end-to-end

**Files:** none

- [ ] **Step 1: Verify the dev server is running**

Run: `lsof -nP -iTCP:3002 -sTCP:LISTEN | head` → should show a node process on 3002. If not, start it.

- [ ] **Step 2: Run the migration**

Open Supabase SQL editor and run the contents of `docs/migrations/2026-05-07-phase-0-profiles.sql`. Verify with:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
```

Expected: 14 columns. Pause if any are missing.

- [ ] **Step 3: Test sign-in via Google**

In a fresh incognito window, open `http://localhost:3002/account`. Expect the auth modal to be open. Click "continue with google", authorize, get redirected back to `/account`. Confirm:
- Header avatar now shows your initial.
- Settings tab shows your display name (lowercased Google name).
- `select * from profiles` in Supabase shows your row.

- [ ] **Step 4: Test magic link**

Sign out, then click "email me a link" → enter an email → "send link" → status changes to "check your inbox" → click the email link → redirected to `/account` signed in. Confirm a new profile row was created (or existing one matched).

- [ ] **Step 5: Test paste-key**

In Settings tab, paste a valid 8-char Crockford key (or one that exists from a leaderboard submission). Click "link". Expect "linked: ABCD1234" success message. Confirm the row in `profiles` now has `account_key` populated.

- [ ] **Step 6: Test conflict**

Try pasting a key that's already linked to another profile (manually update a different `profiles` row to claim a key first, then try). Expect 409 inline error: "that key belongs to another account".

- [ ] **Step 7: Test auto-migration**

Sign out. In another tab, submit a leaderboard entry as anonymous (this seeds `localStorage.holymog-account-key`). Then sign in to the account page again — the localStorage key should be auto-linked silently. Confirm the profile row shows the linked key.

- [ ] **Step 8: Test sign-out**

Click sign out in the Settings tab. Confirm:
- Header avatar reverts to "sign in" pill.
- `localStorage.holymog-account-key` is still present (we don't clear it on sign-out).

- [ ] **Step 9: Push to production**

```bash
git push origin main
```

Phase 0 is shipped.

---

## Self-review

**Spec coverage:**
- §5 (auth flow) — covered by Tasks 9, 10, 19.
- §6 (profiles table + RLS) — covered by Task 2.
- §11 (`/api/account/link-key`) — covered by Task 11.
- §10 settings tab — covered by Task 17.
- Same-device key auto-migration — Task 19.
- Cross-device paste flow — Tasks 12 + 17.
- AppHeader on non-`/scan` routes — Tasks 14, 20.
- Stats/history placeholders — Tasks 15, 16.

**Spec items deferred to later phases (NOT in Phase 0, intentional):**
- Stats tab actual implementation → Phase 3.
- History tab → Phase 5.
- Home page restructure → Phase 1.
- Battles entirely → Phases 2–4.

**Type consistency:** All component prop types match across files. `useUser` returns `{ user, loading, signOut }` and is consumed identically by `AccountAvatar`, `/account/page.tsx`, `AccountSettingsTab`. The `Profile` type in `AccountSettingsTab` matches the columns selected.

**Placeholder scan:** No "TBD"/"TODO"/"implement later" anywhere. All code blocks are complete.

**Scope check:** Each task is an isolated unit, 5–20 lines of code. The plan ends in a deployable state where signed-in users can manage their accounts but battles don't exist yet (which is exactly the spec's Phase 0 boundary).
