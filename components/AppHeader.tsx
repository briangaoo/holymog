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
        className="font-mono text-sm lowercase text-white transition-opacity hover:opacity-80"
      >
        holymog
      </Link>
      <AccountAvatar next={authNext} context={authContext} />
    </header>
  );
}
