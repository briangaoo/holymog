'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Camera, Crown, Swords } from 'lucide-react';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import type { LeaderboardRow } from '@/lib/supabase';
import { writeLeaderboardCache } from '@/lib/leaderboardCache';
import { AppHeader } from '@/components/AppHeader';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { Frame } from '@/components/customization/Frame';
import { Badge } from '@/components/customization/Badge';
import { NameFx } from '@/components/customization/NameFx';
import type { UserStats } from '@/lib/customization';

type Tab = 'scans' | 'battles';
type Status = 'loading' | 'ready' | 'unconfigured' | 'error';

type ScanApiResponse = {
  entries?: LeaderboardRow[];
  hasMore?: boolean;
  error?: string;
};

type BattleRow = {
  user_id: string;
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  avatar_url: string | null;
  equipped_frame?: string | null;
  equipped_flair?: string | null;
  equipped_name_fx?: string | null;
  current_streak?: number | null;
  best_scan_overall?: number | null;
  is_subscriber?: boolean;
};

type BattleApiResponse = {
  entries?: BattleRow[];
  hasMore?: boolean;
  error?: string;
};

type Prefetched = {
  scans: ScanApiResponse | null;
  battles: BattleApiResponse | null;
};

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('scans');
  // Prefetch both tabs' page-1 in parallel on mount. While either is in
  // flight, the entire page renders a full-bleed spinner. Once both
  // resolve, the prefetched data flows into ScansTab + BattlesTab as
  // `initial` so swapping tabs is instant — zero loading time after the
  // first paint.
  const [prefetched, setPrefetched] = useState<Prefetched | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [scans, battles] = await Promise.all([
        fetch('/api/leaderboard?page=1', { cache: 'no-store' })
          .then((r) => r.json() as Promise<ScanApiResponse>)
          .catch(() => null),
        fetch('/api/leaderboard/battles?page=1', { cache: 'no-store' })
          .then((r) => r.json() as Promise<BattleApiResponse>)
          .catch(() => null),
      ]);
      if (cancelled) return;
      setPrefetched({ scans, battles });
      if (scans && !scans.error && scans.entries) {
        writeLeaderboardCache(scans.entries, !!scans.hasMore);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!prefetched) {
    return (
      <div className="relative min-h-dvh bg-black">
        <AppHeader authNext="/leaderboard" />
        <FullPageSpinner label="loading leaderboard" />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-black">
      {/* Soft white wash anchored top-centre — just enough ambient
          glow above the podium to feel like stadium lighting without
          tipping into colour territory. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 55%)',
        }}
      />
      <AppHeader authNext="/leaderboard" />

      <main className="relative mx-auto w-full max-w-2xl px-5 pb-12 pt-4">
        <h1
          className="mb-1 text-2xl font-bold tracking-tight text-white"
          style={{ textShadow: '0 0 28px rgba(255,255,255,0.3)' }}
        >
          Leaderboard
        </h1>
        <p className="mb-4 text-[12px] text-white/50">
          {tab === 'scans'
            ? 'Top scan scores · sorted by overall'
            : 'Top 1v1 battles · sorted by ELO'}
        </p>

        <TabBar tab={tab} onChange={setTab} />

        {tab === 'scans' ? (
          <ScansTab initial={prefetched.scans} />
        ) : (
          <BattlesTab initial={prefetched.battles} />
        )}
      </main>
    </div>
  );
}

function TabBar({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
}) {
  return (
    <div
      className="mb-5 grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-white/15 bg-black/60 p-0 backdrop-blur"
    >
      <TabButton
        active={tab === 'scans'}
        onClick={() => onChange('scans')}
        icon={<Camera size={14} aria-hidden />}
        label="Scans"
      />
      <TabButton
        active={tab === 'battles'}
        onClick={() => onChange('battles')}
        icon={<Swords size={14} aria-hidden />}
        label="Battles"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: 'manipulation' }}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 px-3 py-3 text-[13px] font-semibold transition-all duration-300 ${
        active
          ? 'bg-white text-black shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.1)]'
          : 'bg-transparent text-white/55 hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ---- Scans tab -------------------------------------------------------------

function ScansTab({ initial }: { initial: ScanApiResponse | null }) {
  // Initial state is populated from the parent's prefetch — no in-flight
  // request on first paint. Pagination from page 2 onward is owned here.
  const initialStatus: Status = initial
    ? initial.error === 'unconfigured'
      ? 'unconfigured'
      : initial.error || !initial.entries
        ? 'error'
        : 'ready'
    : 'error';
  const [entries, setEntries] = useState<LeaderboardRow[]>(
    initial?.entries ?? [],
  );
  const [hasMore, setHasMore] = useState(!!initial?.hasMore);
  const [lastLoadedPage, setLastLoadedPage] = useState(initial?.entries ? 1 : 0);
  const [status] = useState<Status>(initialStatus);
  const errorMsg = initial?.error ?? 'network error';
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number): Promise<ScanApiResponse | null> => {
      try {
        const res = await fetch(`/api/leaderboard?page=${page}`, {
          cache: 'no-store',
        });
        return (await res.json()) as ScanApiResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore || status !== 'ready') return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const next = lastLoadedPage + 1;
    const data = await fetchPage(next);
    fetchingRef.current = false;
    setLoadingMore(false);
    if (!data || data.error || !data.entries) return;
    setEntries((prev) => [...prev, ...data.entries!]);
    setHasMore(!!data.hasMore);
    setLastLoadedPage(next);
  }, [fetchPage, hasMore, lastLoadedPage, status]);

  useEffect(() => {
    if (status !== 'ready' || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, hasMore, loadMore]);

  if (status === 'unconfigured') {
    return (
      <div className="border-2 border-white/20 bg-black p-6 text-center" style={{ borderRadius: 2 }}>
        <p className="text-sm font-semibold text-white">Leaderboard not yet available</p>
        <p className="mt-2 text-[12px] text-white/50">
          The Supabase backend hasn&apos;t been configured for this deployment.
        </p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="border-2 border-red-500/40 bg-red-500/[0.06] p-4 text-sm uppercase tracking-[0.14em] text-red-200" style={{ borderRadius: 2 }}>
        {errorMsg}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="border-2 border-white/20 bg-black p-6 text-center" style={{ borderRadius: 2 }}>
        <p className="text-sm font-semibold text-white">No entries yet</p>
        <p className="mt-2 text-[12px] text-white/50">Be the first.</p>
      </div>
    );
  }
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  return (
    <>
      <ScansPodium entries={podium} />
      {rest.length > 0 && (
        <>
          <div className="mb-2 mt-2 flex items-center gap-2">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
              Ranks 4+
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <ol className="flex flex-col gap-2">
            {rest.map((row, i) => (
              <ScanRow key={row.id} row={row} rank={i + 4} />
            ))}
          </ol>
        </>
      )}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center pt-6 pb-2"
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            {loadingMore ? 'Loading more…' : 'Scroll for more'}
          </span>
        </div>
      )}
      {!hasMore && (
        <p className="pt-6 pb-2 text-center text-[10px] uppercase tracking-[0.22em] text-white/30">
          End of leaderboard
        </p>
      )}
    </>
  );
}

// ---- Battles tab -----------------------------------------------------------

function BattlesTab({ initial }: { initial: BattleApiResponse | null }) {
  const initialStatus: Status = initial
    ? initial.error || !initial.entries
      ? 'error'
      : 'ready'
    : 'error';
  const [entries, setEntries] = useState<BattleRow[]>(initial?.entries ?? []);
  const [hasMore, setHasMore] = useState(!!initial?.hasMore);
  const [lastLoadedPage, setLastLoadedPage] = useState(initial?.entries ? 1 : 0);
  const [status] = useState<Status>(initialStatus);
  const errorMsg = initial?.error ?? 'network error';
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number): Promise<BattleApiResponse | null> => {
      try {
        const res = await fetch(`/api/leaderboard/battles?page=${page}`, {
          cache: 'no-store',
        });
        return (await res.json()) as BattleApiResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore || status !== 'ready') return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const next = lastLoadedPage + 1;
    const data = await fetchPage(next);
    fetchingRef.current = false;
    setLoadingMore(false);
    if (!data || data.error || !data.entries) return;
    setEntries((prev) => [...prev, ...data.entries!]);
    setHasMore(!!data.hasMore);
    setLastLoadedPage(next);
  }, [fetchPage, hasMore, lastLoadedPage, status]);

  useEffect(() => {
    if (status !== 'ready' || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, hasMore, loadMore]);

  if (status === 'error') {
    return (
      <div className="border-2 border-red-500/40 bg-red-500/[0.06] p-4 text-sm uppercase tracking-[0.14em] text-red-200" style={{ borderRadius: 2 }}>
        {errorMsg}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="border-2 border-white/20 bg-black p-6 text-center" style={{ borderRadius: 2 }}>
        <p className="text-sm font-semibold text-white">No battles yet</p>
        <p className="mt-2 text-[12px] text-white/50">Queue up to climb the ladder.</p>
      </div>
    );
  }
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  return (
    <>
      <BattlesPodium entries={podium} />
      {rest.length > 0 && (
        <>
          <div className="mb-2 mt-2 flex items-center gap-2">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
              Ranks 4+
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <ol className="flex flex-col gap-2">
            {rest.map((row, i) => (
              <BattleRow key={row.user_id} row={row} rank={i + 4} />
            ))}
          </ol>
        </>
      )}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center pt-6 pb-2"
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            {loadingMore ? 'Loading more…' : 'Scroll for more'}
          </span>
        </div>
      )}
      {!hasMore && (
        <p className="pt-6 pb-2 text-center text-[10px] uppercase tracking-[0.22em] text-white/30">
          End of leaderboard
        </p>
      )}
    </>
  );
}

// ---- Rows ------------------------------------------------------------------

function InitialAvatar({ name }: { name: string }) {
  const trimmed = name.trim();
  const initial = (trimmed.charAt(0) || '?').toUpperCase();

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 55%, 42%)`;

  return (
    <div
      aria-hidden
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white uppercase"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </div>
  );
}

// ---- Podium (top 3) --------------------------------------------------------
//
// Stair-stepped physical podium. Three columns side-by-side ordered
// 2nd · 1st · 3rd (Olympic convention) with platform heights tuned so
// 1st sits highest, 2nd in the middle, 3rd shortest. Each column
// stacks: optional crown → avatar in Frame → name + badge → score →
// the podium block itself with the rank number ghosted onto its face.
//
// items-end on the parent aligns the bottom of every platform to the
// same baseline so the "step up" visual reads correctly regardless
// of how tall each column's header is.

const PODIUM_THEME: Record<
  1 | 2 | 3,
  {
    accent: string;
    platformHeight: string;
    avatarSize: number;
    scoreSize: string;
    nameSize: string;
    bgGradient: string;
    borderColor: string;
    rankNumberColor: string;
  }
> = {
  1: {
    accent: '#fbbf24',
    platformHeight: 'h-56 sm:h-64',
    avatarSize: 108,
    scoreSize: 'text-3xl sm:text-5xl',
    nameSize: 'text-sm sm:text-base',
    bgGradient:
      'bg-gradient-to-b from-amber-500/45 via-amber-700/20 to-amber-950/65',
    borderColor: 'border-amber-400/85',
    rankNumberColor: 'text-amber-200/65',
  },
  2: {
    accent: '#e2e8f0',
    platformHeight: 'h-40 sm:h-48',
    avatarSize: 80,
    scoreSize: 'text-2xl sm:text-4xl',
    nameSize: 'text-[13px] sm:text-sm',
    bgGradient:
      'bg-gradient-to-b from-zinc-200/35 via-zinc-500/15 to-zinc-950/65',
    borderColor: 'border-zinc-200/65',
    rankNumberColor: 'text-zinc-100/55',
  },
  3: {
    accent: '#fb923c',
    platformHeight: 'h-32 sm:h-36',
    avatarSize: 72,
    scoreSize: 'text-2xl sm:text-4xl',
    nameSize: 'text-[13px] sm:text-sm',
    bgGradient:
      'bg-gradient-to-b from-orange-500/40 via-orange-700/20 to-orange-950/65',
    borderColor: 'border-orange-400/70',
    rankNumberColor: 'text-orange-200/60',
  },
};

/**
 * One column of the podium. Caller passes whatever should sit above
 * the platform (avatar, name, score) as `children`; the column owns
 * the platform itself + the rank-themed sizing/colour.
 */
function PodiumColumn({
  rank,
  href,
  children,
}: {
  rank: 1 | 2 | 3;
  href: string;
  children: React.ReactNode;
}) {
  const theme = PODIUM_THEME[rank];
  const isFirst = rank === 1;
  return (
    <Link
      href={href}
      // `flex-1 min-w-0` keeps the three columns equal-width and lets
      // each shrink as needed so a long display_name + name fx prefix
      // doesn't blow out one column and squeeze the others. Inner
      // text spans handle their own truncation via max-w-full.
      className="group flex min-w-0 flex-1 flex-col items-center transition-transform duration-300 hover:-translate-y-0.5"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Crown above 1st — solid medal colour, slow sway animation
          replaces the previous heavy drop-shadow glow. */}
      {isFirst && (
        <motion.div
          aria-hidden
          className="mb-1.5"
          animate={{ y: [0, -2, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Crown size={26} className="text-amber-300" />
        </motion.div>
      )}
      {/* Header content (avatar, name, score) provided by caller.
          `w-full` so child elements respect this column's width and
          truncate against it rather than against their intrinsic
          content size. */}
      <div className="flex w-full min-w-0 flex-col items-center gap-1.5 px-1 text-center">
        {children}
      </div>
      {/* Podium platform — 2px medal-coloured border, hard medal-coloured
          stripe at the top edge for the "stage step" cue (no glow),
          diagonal hatch texture for surface depth, and a slow shimmer
          sweep on 1st place only. Rounded-top only so the row of three
          flows as a single tiered stage. */}
      <div
        className={`relative mt-3 flex w-full items-center justify-center overflow-hidden rounded-t-xl border-2 ${theme.borderColor} ${theme.bgGradient} ${theme.platformHeight} transition-colors duration-300 group-hover:brightness-110`}
      >
        {/* Top accent stripe — visual stage-top edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1"
          style={{ background: theme.accent }}
        />
        {/* Diagonal hatch texture for surface depth — security-paper
            feel without any glow. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 10px)',
          }}
        />
        {/* Slow shimmer sweep — 1st place only, no glow. */}
        {isFirst && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 podium-shimmer-sweep"
          />
        )}
        <span
          className={`relative font-num text-7xl font-black leading-none tabular-nums sm:text-8xl ${theme.rankNumberColor}`}
        >
          {rank}
        </span>
      </div>
    </Link>
  );
}

/**
 * Avatar disc used inside every podium column. Wrapped in the user's
 * equipped Frame so frames carry through. The accent ring + glow
 * matches the rank's medal colour.
 */
function PodiumAvatar({
  rank,
  src,
  fallbackName,
  frameSlug,
  userStats,
}: {
  rank: 1 | 2 | 3;
  src: string | null;
  fallbackName: string;
  frameSlug: string | null;
  userStats: UserStats;
}) {
  const theme = PODIUM_THEME[rank];
  return (
    <div>
      <Frame slug={frameSlug} size={theme.avatarSize} userStats={userStats}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <InitialAvatar name={fallbackName} />
        )}
      </Frame>
    </div>
  );
}

function ScansPodium({ entries }: { entries: LeaderboardRow[] }) {
  if (entries.length === 0) return null;
  // 2 - 1 - 3 ordering puts the tallest centred.
  const order: Array<{ rank: 1 | 2 | 3; row: LeaderboardRow | undefined }> = [
    { rank: 2, row: entries[1] },
    { rank: 1, row: entries[0] },
    { rank: 3, row: entries[2] },
  ];
  return (
    <div className="mb-6 flex items-end justify-center gap-2 sm:gap-3">
      {order.map(
        ({ rank, row }) =>
          row && <ScanPodiumColumn key={rank} rank={rank} row={row} />,
      )}
    </div>
  );
}

function ScanPodiumColumn({
  rank,
  row,
}: {
  rank: 1 | 2 | 3;
  row: LeaderboardRow;
}) {
  const theme = PODIUM_THEME[rank];
  const tier = getTier(row.overall);
  const tierStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage:
          'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textTransform: 'uppercase',
      }
    : { color: tier.color, textTransform: 'uppercase' };
  const photoSrc = row.image_url ?? row.avatar_url ?? null;
  // Smart name fx read the user's LIVE profile values (merged into the
  // row server-side), not the denormalised row.overall — so tier-prefix
  // renders the user's actual current tier even when the published
  // entry score is from an older, lower scan. See lib/supabase.ts
  // LeaderboardRow type for the merge contract.
  const userStats: UserStats = {
    bestScanOverall: row.best_scan_overall ?? row.overall,
    elo: row.elo ?? null,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
    matchesWon: row.matches_won ?? null,
  };
  return (
    <PodiumColumn rank={rank} href={`/@${row.name}`}>
      <PodiumAvatar
        rank={rank}
        src={photoSrc}
        fallbackName={row.name}
        frameSlug={row.equipped_frame ?? null}
        userStats={userStats}
      />
      {/* Name + flair — wraps a min-w-0 + truncate span so a long
          display_name + name fx prefix cuts cleanly with an ellipsis
          inside this column instead of pushing the column wider. */}
      <div
        className={`mt-1 flex w-full min-w-0 items-center justify-center gap-1 ${theme.nameSize} font-semibold text-white`}
      >
        <span className="block min-w-0 max-w-full truncate">
          <NameFx slug={row.equipped_name_fx ?? null} userStats={userStats}>
            @{row.name}
          </NameFx>
        </span>
        {row.equipped_flair && (
          <Badge
            slug={row.equipped_flair}
            size={rank === 1 ? 16 : 12}
            userStats={userStats}
          />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-num font-extrabold leading-none tabular-nums ${theme.scoreSize}`}
          style={{ color: theme.accent }}
        >
          {row.overall}
        </span>
        <span
          className={`font-num font-black uppercase ${
            rank === 1 ? 'text-base' : 'text-sm'
          }`}
          style={tierStyle}
        >
          {row.tier}
        </span>
      </div>
    </PodiumColumn>
  );
}

function BattlesPodium({ entries }: { entries: BattleRow[] }) {
  if (entries.length === 0) return null;
  const order: Array<{ rank: 1 | 2 | 3; row: BattleRow | undefined }> = [
    { rank: 2, row: entries[1] },
    { rank: 1, row: entries[0] },
    { rank: 3, row: entries[2] },
  ];
  return (
    <div className="mb-6 flex items-end justify-center gap-2 sm:gap-3">
      {order.map(
        ({ rank, row }) =>
          row && <BattlePodiumColumn key={rank} rank={rank} row={row} />,
      )}
    </div>
  );
}

function BattlePodiumColumn({
  rank,
  row,
}: {
  rank: 1 | 2 | 3;
  row: BattleRow;
}) {
  const theme = PODIUM_THEME[rank];
  // bestScanOverall comes from the live profile (server-merged) so the
  // tier-prefix cosmetic renders the user's actual scan tier on the
  // ELO board too — otherwise tier-prefix would be empty here.
  const userStats: UserStats = {
    elo: row.elo,
    bestScanOverall: row.best_scan_overall ?? null,
    matchesWon: row.matches_won,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
  };
  return (
    <PodiumColumn rank={rank} href={`/@${row.display_name}`}>
      <PodiumAvatar
        rank={rank}
        src={row.avatar_url}
        fallbackName={row.display_name}
        frameSlug={row.equipped_frame ?? null}
        userStats={userStats}
      />
      <div
        className={`mt-1 flex w-full min-w-0 items-center justify-center gap-1 ${theme.nameSize} font-semibold text-white`}
      >
        <span className="block min-w-0 max-w-full truncate">
          <NameFx slug={row.equipped_name_fx ?? null} userStats={userStats}>
            @{row.display_name}
          </NameFx>
        </span>
        {row.equipped_flair && (
          <Badge
            slug={row.equipped_flair}
            size={rank === 1 ? 16 : 12}
            userStats={userStats}
          />
        )}
      </div>
      <span
        className={`font-num font-extrabold leading-none tabular-nums ${theme.scoreSize}`}
        style={{ color: theme.accent }}
      >
        {row.elo}
      </span>
    </PodiumColumn>
  );
}

function ScanRow({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const tier = getTier(row.overall);
  const isGradient = tier.isGradient;
  const tierStyle: React.CSSProperties = isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textTransform: 'uppercase',
      }
    : { color: tier.color, textTransform: 'uppercase' };
  const photoSrc = row.image_url ?? row.avatar_url ?? null;
  // Smart name fx read the user's LIVE profile values (merged into the
  // row server-side), not the denormalised row.overall — keeps
  // tier-prefix etc consistent with what the same user shows on every
  // other surface (settings, account, public profile). See
  // lib/supabase.ts LeaderboardRow for the merge contract.
  const userStats: UserStats = {
    bestScanOverall: row.best_scan_overall ?? row.overall,
    elo: row.elo ?? null,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
    matchesWon: row.matches_won ?? null,
  };
  return (
    <li>
      <Link
        href={`/@${row.name}`}
        className="flex items-center gap-3 border border-white/20 bg-black p-3 transition-colors hover:border-white/50 hover:bg-white/[0.03]"
        style={{ borderRadius: 2 }}
      >
        <div
          className="w-7 text-right font-num text-sm font-bold tabular-nums text-white/50"
        >
          {rank}
        </div>
        <Frame slug={row.equipped_frame ?? null} size={40} userStats={userStats}>
          {photoSrc ? (
            <img
              src={photoSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <InitialAvatar name={row.name} />
          )}
        </Frame>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
            <NameFx slug={row.equipped_name_fx ?? null} userStats={userStats}>
              {row.name}
            </NameFx>
            <Badge slug={row.equipped_flair ?? null} userStats={userStats} />
          </div>
          <div className="text-[11px] text-zinc-500">
            <span className="uppercase">J</span> {row.jawline} ·{' '}
            <span className="uppercase">E</span> {row.eyes} ·{' '}
            <span className="uppercase">S</span> {row.skin} ·{' '}
            <span className="uppercase">C</span> {row.cheekbones}
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-num text-2xl font-extrabold leading-none uppercase"
            style={tierStyle}
            aria-label={`Tier ${row.tier}`}
          >
            {row.tier}
          </div>
          <div
            className="font-num text-xs font-semibold tabular-nums"
            style={{ color: getScoreColor(row.overall) }}
          >
            {row.overall}
          </div>
        </div>
      </Link>
    </li>
  );
}

function BattleRow({ row, rank }: { row: BattleRow; rank: number }) {
  const losses = Math.max(0, row.matches_played - row.matches_won);
  // bestScanOverall comes from the live profile (server-merged) so
  // tier-prefix renders consistently here too. elo-king + streak-flame
  // already had what they need.
  const userStats: UserStats = {
    elo: row.elo,
    bestScanOverall: row.best_scan_overall ?? null,
    matchesWon: row.matches_won,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
  };
  return (
    <li>
      <Link
        href={`/@${row.display_name}`}
        className="flex items-center gap-3 border border-white/20 bg-black p-3 transition-colors hover:border-white/50 hover:bg-white/[0.03]"
        style={{ borderRadius: 2 }}
      >
        <div
          className="w-7 text-right font-num text-sm font-bold tabular-nums text-white/50"
        >
          {rank}
        </div>
        <Frame slug={row.equipped_frame ?? null} size={40} userStats={userStats}>
          {row.avatar_url ? (
            <img
              src={row.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <InitialAvatar name={row.display_name} />
          )}
        </Frame>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
            <NameFx slug={row.equipped_name_fx ?? null} userStats={userStats}>
              {row.display_name}
            </NameFx>
            <Badge slug={row.equipped_flair ?? null} userStats={userStats} />
          </div>
          <div className="text-[11px] text-zinc-500">
            {row.matches_played === 0 ? (
              'unranked'
            ) : (
              <>
                {row.matches_won}
                <span className="uppercase">w</span> / {losses}
                <span className="uppercase">l</span> · peak {row.peak_elo}
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-num text-2xl font-extrabold leading-none tabular-nums text-white">
            {row.elo}
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            ELO
          </div>
        </div>
      </Link>
    </li>
  );
}
