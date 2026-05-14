'use client';

import { useEffect, useRef } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { AchievementToastContainer } from './AchievementToast';
import { StorageOutageBanner } from './StorageOutageBanner';

/**
 * Mounts Auth.js's SessionProvider so every client component can call
 * `useSession()` without hitting an unmounted-context error. Also runs
 * the post-sign-in localStorage → account migration via
 * <ScanMigrationWatcher>, and the global achievement-toast container.
 *
 * StorageOutageBanner sits as the first child so it renders at the very
 * top of the document, above AppHeader and every page's wordmark, while
 * Supabase Storage is wedged for this project. Remove once Storage is
 * restored (see banner file header).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <StorageOutageBanner />
      <ScanMigrationWatcher />
      {children}
      <AchievementToastContainer />
    </SessionProvider>
  );
}

const STORAGE_KEY = 'holymog-last-result';

/**
 * Watches for the unauthenticated → authenticated session transition
 * and lifts a localStorage scan into the user's account if the saved
 * blob has a full vision payload. Idempotent and best-effort: any
 * failure (no vision in the blob, network error, missing endpoint)
 * silently no-ops without disturbing the user.
 *
 * Why client-side: the localStorage blob lives in the browser, the
 * server can't read it, and we don't want to ship the blob through
 * the OAuth callback. A small one-shot effect after the session
 * appears is the simplest path.
 */
function ScanMigrationWatcher() {
  const { status, data } = useSession();
  const migratedRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !data?.user) return;
    if (migratedRef.current) return;
    migratedRef.current = true;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let parsed: { vision?: unknown } | null = null;
    try {
      parsed = JSON.parse(raw) as { vision?: unknown };
    } catch {
      return;
    }
    if (!parsed?.vision || typeof parsed.vision !== 'object') {
      return;
    }

    void fetch('/api/account/migrate-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vision: parsed.vision }),
    }).catch(() => false);
    // We deliberately do NOT clear the localStorage entry. The /scan
    // page still uses it for hydration on revisit; persisting is
    // additive — server gets a copy, client keeps its cache.
  }, [status, data]);

  return null;
}
