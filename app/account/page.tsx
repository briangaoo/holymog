'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { AccountStatsTab } from '@/components/AccountStatsTab';
import { AccountHistoryTab } from '@/components/AccountHistoryTab';
import { AccountSettingsTab } from '@/components/AccountSettingsTab';
import { AvatarFallback } from '@/components/AvatarFallback';
import { NameFx } from '@/components/customization/NameFx';
import type { UserStats } from '@/lib/customization';
import type { VisionScore, FinalScores } from '@/types';

type Tab = 'stats' | 'history' | 'settings';

// Shapes returned by the API — shared across all three tabs.
export type MeData = {
  /** The user's current avatar URL — mirrors users.image. Sourced
   *  through here (not through useSession) so refreshMe() picks up
   *  changes after the user uploads or removes their avatar. */
  image?: string | null;
  profile: {
    display_name: string;
    elo: number;
    peak_elo: number;
    matches_played: number;
    matches_won: number;
    matches_tied: number;
    current_streak: number;
    longest_streak: number;
    best_scan_overall: number | null;
    best_scan: { vision: VisionScore; scores: FinalScores } | null;
    improvement_counts: Record<string, number>;
    bio: string | null;
    location: string | null;
    banner_url: string | null;
    socials: Record<string, string | null> | null;
    hide_photo_from_leaderboard: boolean;
    hide_elo: boolean;
    mute_battle_sfx: boolean;
    weekly_digest: boolean;
    mog_email_alerts: boolean;
    equipped_flair: string | null;
    equipped_theme: string | null;
    equipped_frame: string | null;
    equipped_name_fx: string | null;
    two_factor_enabled: boolean;
    subscription_status: string | null;
    subscription_tier: string | null;
    subscription_started_at: string | null;
    subscription_current_period_end: string | null;
    monthly_cosmetic_claimed_at: string | null;
    stripe_subscription_id: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null;
  weakest_sub_score?: 'jawline' | 'eyes' | 'skin' | 'cheekbones' | null;
  is_subscriber?: boolean;
  entry: { id: string; image_url?: string | null } | null;
  total_scans?: number;
  account_age_days?: number;
  highest_overall_ever?: number | null;
  elo_sparkline?: Array<{ elo: number; recorded_at: string }>;
  most_improved?: { metric: string; delta: number } | null;
  recent_battle_results?: Array<'win' | 'loss' | 'tie'>;
  biggest_win?: {
    delta: number;
    opponent_display_name: string | null;
    finished_at: string | null;
  } | null;
  biggest_loss?: {
    delta: number;
    opponent_display_name: string | null;
    finished_at: string | null;
  } | null;
  scan_overalls?: number[];
};

export type HistoryEntry = {
  battle_id: string;
  kind: 'public' | 'private';
  finished_at: string | null;
  is_winner: boolean;
  peak_score: number;
  opponents: Array<{ display_name: string; peak_score: number }>;
};

export type HistoryData = {
  entries?: HistoryEntry[];
  hasMore?: boolean;
  error?: string;
};

type Prefetched = {
  me: MeData | null;
  history: HistoryData | null;
};

const VALID_TABS: ReadonlySet<Tab> = new Set(['stats', 'history', 'settings']);

function isValidTab(value: string | null): value is Tab {
  return value !== null && VALID_TABS.has(value as Tab);
}

/**
 * Next.js prerenders client components at build time, and any
 * useSearchParams() call inside one needs a Suspense boundary above it
 * so the prerender can bail out cleanly. We wrap the real component
 * in <Suspense> below; this is the inner implementation.
 */
function AccountPageInner() {
  const { user, loading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tab is sourced from `?tab=…` so a reload (or a deep-link from the
  // header chip / the leaderboard "edit in settings" link) preserves
  // whichever tab the user was on. Fallback is 'stats' for clean URLs.
  const tabFromUrl = searchParams.get('tab');
  const initialTab: Tab = isValidTab(tabFromUrl) ? tabFromUrl : 'stats';
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [prefetched, setPrefetched] = useState<Prefetched | null>(null);

  // Sync URL → state when the user uses browser back/forward.
  useEffect(() => {
    const next = isValidTab(tabFromUrl) ? tabFromUrl : 'stats';
    setTabState((curr) => (curr === next ? curr : next));
  }, [tabFromUrl]);

  // State → URL via shallow replace so reloads land back on the same
  // tab. router.replace doesn't push history, so the back button still
  // exits /account cleanly instead of cycling through tabs.
  const setTab = useCallback(
    (next: Tab) => {
      setTabState(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'stats') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      const qs = params.toString();
      router.replace(qs ? `/account?${qs}` : '/account', { scroll: false });
    },
    [router, searchParams],
  );

  // Once auth resolves, fire both account fetches in parallel.
  // If the user isn't signed in, set prefetched immediately so we skip
  // the spinner and go straight to the unauthenticated UI.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setPrefetched({ me: null, history: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const [me, history] = await Promise.all([
        fetch('/api/account/me', { cache: 'no-store' })
          .then((r) => r.json() as Promise<MeData>)
          .catch(() => null),
        fetch('/api/account/history?page=1', { cache: 'no-store' })
          .then((r) => r.json() as Promise<HistoryData>)
          .catch(() => null),
      ]);
      if (!cancelled) setPrefetched({ me, history });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // Hot-refresh /api/account/me — children call this after they mutate
  // profile/avatar/banner/username so the rest of the page re-renders
  // without a full page reload. Cheaper than reload because we don't
  // re-fetch history.
  const refreshMe = useCallback(async () => {
    try {
      const me = (await fetch('/api/account/me', { cache: 'no-store' }).then(
        (r) => r.json(),
      )) as MeData;
      setPrefetched((curr) =>
        curr ? { ...curr, me } : { me, history: null },
      );
      // Broadcast so siblings outside this page tree (AppHeader's
      // AccountAvatar chip) also re-fetch — useSession's user.image
      // doesn't auto-refresh after avatar upload/delete, so without
      // this the header chip keeps showing the old picture until the
      // session re-issues a token.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('holymog:profile-changed'));
      }
    } catch {
      // ignore — the next page navigation will pick up fresh state
    }
  }, []);

  // Banner image preload — the banner only renders inside the Settings
  // tab's ProfileSection, but the URL is known immediately from
  // /api/account/me. Kicking off the image download in parallel means
  // when the user tabs into Settings the banner is already in the
  // browser cache (no flash of "missing banner" while the JPEG loads).
  useEffect(() => {
    const banner = prefetched?.me?.profile?.banner_url;
    if (!banner) return;
    const img = new window.Image();
    img.src = banner;
  }, [prefetched?.me?.profile?.banner_url]);

  if (!prefetched) {
    return (
      <div className="relative min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <FullPageSpinner label="loading account" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <main className="mx-auto w-full max-w-md px-5 py-8">
          <p className="text-sm text-white">sign in to see your account</p>
        </main>
        <AuthModal
          open
          onClose={() => router.push('/')}
          next="/account"
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      {/* Ambient gradient blobs — give the section glass something to
          refract. Three patches at corners, low-saturation so colour
          on the cards is per-section accent, not page-wide. */}
      <span
        aria-hidden
        className="pointer-events-none fixed -top-32 -right-32 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.10) 0%, rgba(14,165,233,0.04) 40%, transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -left-40 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(168,85,247,0.10) 0%, rgba(139,92,246,0.04) 40%, transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none fixed bottom-1/3 -right-40 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 60%)',
        }}
      />

      <AppHeader />
      <main className="relative mx-auto w-full max-w-2xl px-5 py-6">
        <header className="mb-6 flex items-center gap-3">
          {prefetched.me?.image ?? user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={prefetched.me?.image ?? user.image ?? ''}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded-full border border-white/15 object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-white/15">
              <AvatarFallback
                seed={
                  prefetched.me?.profile?.display_name ?? user.email ?? '?'
                }
                textClassName="text-lg"
              />
            </span>
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="truncate text-base font-semibold text-white">
              <NameFx
                slug={prefetched.me?.profile?.equipped_name_fx ?? null}
                userStats={
                  {
                    elo: prefetched.me?.profile?.elo ?? null,
                    bestScanOverall:
                      prefetched.me?.profile?.best_scan_overall ?? null,
                    currentStreak:
                      prefetched.me?.profile?.current_streak ?? null,
                    currentWinStreak:
                      prefetched.me?.profile?.current_streak ?? null,
                    matchesWon: prefetched.me?.profile?.matches_won ?? null,
                    weakestSubScore: prefetched.me?.weakest_sub_score ?? null,
                  } satisfies UserStats
                }
              >
                {prefetched.me?.profile?.display_name ?? user.email ?? user.id}
              </NameFx>
            </h1>
            {user.email && prefetched.me?.profile?.display_name && (
              <span className="truncate text-[11px] text-zinc-500">
                {user.email}
              </span>
            )}
          </div>
          {prefetched.me?.profile?.display_name && (
            <Link
              href={`/@${prefetched.me.profile.display_name}`}
              className="ml-auto rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              view public profile
            </Link>
          )}
        </header>

        <nav
          aria-label="account tabs"
          className="mb-6 flex gap-5 border-b border-white/10 text-xs"
        >
          {(['stats', 'history', 'settings'] as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{ touchAction: 'manipulation' }}
                className={`relative -mb-px px-0.5 pb-2.5 transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-px left-0 right-0 h-px bg-white"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {tab === 'stats' && <AccountStatsTab initial={prefetched.me} />}
        {tab === 'history' && <AccountHistoryTab initial={prefetched.history} />}
        {tab === 'settings' && (
          <AccountSettingsTab initial={prefetched.me} onRefresh={refreshMe} />
        )}
      </main>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="loading account" />}>
      <AccountPageInner />
    </Suspense>
  );
}
