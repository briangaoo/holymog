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
          style={{ touchAction: 'manipulation' }}
          className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-white transition-colors hover:bg-white/[0.07]"
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
  const seed = user.name || user.email || 'p';
  const initial = seed.charAt(0).toUpperCase();

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;

  return (
    <Link
      href="/account"
      aria-label="account"
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90"
      style={{ backgroundColor: `hsl(${hue}, 55%, 38%)` }}
    >
      <span className="normal-case">{initial}</span>
    </Link>
  );
}
