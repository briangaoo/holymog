'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { Frame } from './customization/Frame';
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
  const [equippedFrame, setEquippedFrame] = useState<string | null>(null);

  // Fetch the equipped frame once on sign-in so the header avatar shows
  // flair. Cheap one-shot — no polling, no SWR. Refetched only when
  // user.id changes (sign-in / sign-out).
  useEffect(() => {
    if (!user?.id) {
      setEquippedFrame(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile: { equipped_frame: string | null } | null;
        };
        if (!cancelled) setEquippedFrame(data.profile?.equipped_frame ?? null);
      } catch {
        // ignore — header avatar still renders without flair
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  // Fallback: colored initial circle.
  const seed = user.name || user.email || 'p';
  const initial = seed.charAt(0).toUpperCase();

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;

  const inner = user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.image} alt="" className="h-full w-full object-cover" />
  ) : (
    <span
      className="flex h-full w-full items-center justify-center text-xs font-semibold text-white normal-case"
      style={{ backgroundColor: `hsl(${hue}, 55%, 38%)` }}
    >
      {initial}
    </span>
  );

  // If the user has an equipped frame, wrap with the Frame component;
  // else render the legacy plain bordered circle so the header is
  // unchanged for everyone who hasn't customized.
  if (equippedFrame) {
    return (
      <Link href="/account" aria-label="account" className="block">
        <Frame slug={equippedFrame} size={32}>
          {inner}
        </Frame>
      </Link>
    );
  }

  return (
    <Link
      href="/account"
      aria-label="account"
      className="block h-8 w-8 overflow-hidden rounded-full border border-white/15 transition-opacity hover:opacity-90"
    >
      {inner}
    </Link>
  );
}
