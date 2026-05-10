'use client';

import { useMemo } from 'react';
import { useSession, signOut as authSignOut } from 'next-auth/react';

type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

/**
 * Thin wrapper around Auth.js's `useSession()` so the rest of the app
 * doesn't import next-auth directly. If we ever swap auth libraries
 * (Lucia, Clerk, etc.) only this file changes.
 *
 * The returned `user` is memoized on its primitive fields so the
 * reference only changes when one of them actually changes. Without
 * this, every consumer's `useEffect` with `user` in its deps would
 * fire on every render — which broke the settings tab: typing into
 * the username input re-rendered, useEffect re-fetched the profile,
 * and refreshProfile() overwrote the typed value.
 */
export function useUser() {
  const { data, status } = useSession();
  const loading = status === 'loading';
  const id = data?.user?.id ?? null;
  const name = data?.user?.name ?? null;
  const email = data?.user?.email ?? null;
  const image = data?.user?.image ?? null;

  const user = useMemo<AppUser | null>(() => {
    if (!id) return null;
    return { id, name, email, image };
  }, [id, name, email, image]);

  const signOut = async () => {
    await authSignOut({ redirect: false });
  };

  return { user, loading, signOut };
}
