'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Mounts Auth.js's SessionProvider so every client component can call
 * `useSession()` without hitting an unmounted-context error.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
