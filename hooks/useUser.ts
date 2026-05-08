'use client';

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
 */
export function useUser() {
  const { data, status } = useSession();
  const loading = status === 'loading';
  const user: AppUser | null = data?.user
    ? {
        id: data.user.id,
        name: data.user.name ?? null,
        email: data.user.email ?? null,
        image: data.user.image ?? null,
      }
    : null;

  const signOut = async () => {
    await authSignOut({ redirect: false });
  };

  return { user, loading, signOut };
}
