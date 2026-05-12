'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { Frame } from './customization/Frame';
import { AuthModal } from './AuthModal';
import { AvatarFallback } from './AvatarFallback';
import { readBackNav } from '@/lib/back-nav';

type Props = {
  /** Where to come back to after sign-in (defaults to current path). */
  next?: string;
  /** Subtitle, e.g. "to battle". */
  context?: string;
};

/**
 * sessionStorage-backed cache so the fallback circle paints in the
 * right colour on first commit after refresh instead of flashing the
 * email-seeded hue while /api/account/me is in flight. Keyed by
 * user.id so sign-out → sign-in-as-someone-else doesn't carry over.
 */
const CACHE_PREFIX = 'holymog-avatar:';

type CachedProfile = {
  equippedFrame: string | null;
  displayName: string | null;
  /** Mirrored from users.image via /api/account/me. We prefer this
   *  over useSession's user.image so avatar uploads/deletes show up
   *  immediately — the Auth.js session token doesn't auto-refresh
   *  on a column change, so reading user.image leaves the header
   *  chip showing the old picture. */
  image: string | null;
};

function readAvatarCache(userId: string): CachedProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProfile>;
    return {
      equippedFrame:
        typeof parsed.equippedFrame === 'string' ? parsed.equippedFrame : null,
      displayName:
        typeof parsed.displayName === 'string' ? parsed.displayName : null,
      image: typeof parsed.image === 'string' ? parsed.image : null,
    };
  } catch {
    return null;
  }
}

function writeAvatarCache(userId: string, value: CachedProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      CACHE_PREFIX + userId,
      JSON.stringify(value),
    );
  } catch {
    // private mode / quota — ignore; next paint just flickers once
  }
}

export function AccountAvatar({ next, context }: Props) {
  const { user, loading } = useUser();
  const [authOpen, setAuthOpen] = useState(false);

  // Re-open the sign-in modal when the user is returning from /terms
  // or /privacy and we dropped an "auth" back-nav breadcrumb. The
  // breadcrumb is consumed (cleared) inside AuthModal itself.
  useEffect(() => {
    const snap = readBackNav();
    if (snap?.modal?.id === 'auth') setAuthOpen(true);
  }, []);
  // equipped_frame drives the cosmetic ring; display_name drives the
  // fallback-circle hue. Auth.js's session.user.name is the raw OAuth
  // name (and null for magic-link sign-ups) so this chip used to hash
  // a different seed than the rest of the app — same user rendering
  // pink on /account and teal on the header. Fetching display_name
  // alongside equipped_frame and using it as the seed keeps every
  // initial-circle for one user a single colour.
  const [profile, setProfile] = useState<CachedProfile>({
    equippedFrame: null,
    displayName: null,
    image: null,
  });
  // Tracks whether profile state has been hydrated (from cache or
  // from /api/account/me). Needed to disambiguate "image is null
  // because the user just deleted their avatar" from "image is null
  // because we haven't fetched yet" — only in the former case do we
  // want to ignore the (now stale) user.image from useSession.
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Hydrate from sessionStorage synchronously after the user.id is
  // known but before the browser paints. useLayoutEffect runs during
  // React's commit phase, so setState here triggers a re-render that
  // gets flushed into the same paint cycle — no visible flash of the
  // email-seeded hue on refresh.
  useLayoutEffect(() => {
    if (!user?.id) return;
    const cached = readAvatarCache(user.id);
    if (cached) {
      setProfile(cached);
      setProfileLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setProfile({ equippedFrame: null, displayName: null, image: null });
      setProfileLoaded(false);
      return;
    }
    let cancelled = false;
    const userId = user.id;

    const fetchMe = async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          image?: string | null;
          profile: {
            display_name: string | null;
            equipped_frame: string | null;
          } | null;
        };
        if (cancelled) return;
        const next: CachedProfile = {
          equippedFrame: data.profile?.equipped_frame ?? null,
          displayName: data.profile?.display_name ?? null,
          image: data.image ?? null,
        };
        setProfile(next);
        setProfileLoaded(true);
        // Persist for the next refresh so the cache stays warm and
        // catches username / frame / avatar changes within the same
        // session.
        writeAvatarCache(userId, next);
      } catch {
        // ignore — header avatar still renders without flair
      }
    };

    void fetchMe();

    // Re-fetch when anything in the app mutates profile/avatar/banner.
    // The /account page dispatches this event from refreshMe(); other
    // callers can dispatch it too. Without this, the header chip
    // shows the old avatar after an upload/delete until next nav.
    const onProfileChanged = () => {
      void fetchMe();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('holymog:profile-changed', onProfileChanged);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('holymog:profile-changed', onProfileChanged);
      }
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

  // Prefer the canonical display_name from /api/account/me (matches
  // every other avatar fallback in the app). Fall back to session
  // user.name / email only during the brief fetch window so the chip
  // doesn't render empty on first paint.
  const seed =
    profile.displayName || user.name || user.email || 'p';
  // Avatar image: once /api/account/me (or its cached version) has
  // returned, profile.image is the source of truth — even when null,
  // because the user may have just deleted their avatar. Falling back
  // to user.image here would resurrect the stale picture that the
  // Auth.js session token still carries. Only fall back when we
  // haven't loaded yet (first paint with no warm cache).
  const imageSrc = profileLoaded ? profile.image : (user.image ?? null);
  const inner = imageSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageSrc} alt="" className="h-full w-full object-cover" />
  ) : (
    <AvatarFallback seed={seed} textClassName="text-xs" />
  );

  // If the user has an equipped frame, wrap with the Frame component;
  // else render the legacy plain bordered circle so the header is
  // unchanged for everyone who hasn't customized.
  if (profile.equippedFrame) {
    return (
      <Link href="/account" aria-label="account" className="block">
        <Frame slug={profile.equippedFrame} size={32}>
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
