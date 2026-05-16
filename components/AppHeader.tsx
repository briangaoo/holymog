'use client';

import Image from 'next/image';
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
      className="sticky top-0 z-30 flex items-center justify-between px-5 py-3"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 20px)' }}
    >
      <Link
        href="/"
        aria-label="holymog"
        className="inline-flex transition-opacity hover:opacity-80"
      >
        <Image
          src="/logo-wordmark.png"
          alt="holymog"
          width={120}
          height={29}
          priority
          className="h-6 w-auto rounded-sm"
        />
      </Link>
      <AccountAvatar next={authNext} context={authContext} />
    </header>
  );
}
