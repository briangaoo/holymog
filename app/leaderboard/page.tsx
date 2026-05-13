'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Swords } from 'lucide-react';
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
      <AppHeader authNext="/leaderboard" />

      <main className="mx-auto w-full max-w-md px-5 pb-12 pt-4">
        <h1 className="mb-1 text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mb-4 text-sm text-zinc-400">
          {tab === 'scans'
            ? 'Top scan scores. Sorted by overall.'
            : 'Top 1v1 battles. Sorted by ELO.'}
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
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
      <TabButton
        active={tab === 'scans'}
        onClick={() => onChange('scans')}
        icon={<Camera size={14} aria-hidden />}
        label="scans"
      />
      <TabButton
        active={tab === 'battles'}
        onClick={() => onChange('battles')}
        icon={<Swords size={14} aria-hidden />}
        label="battles"
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
        active
          ? 'bg-white text-black'
          : 'text-zinc-400 hover:text-white'
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white">leaderboard not yet available</p>
        <p className="mt-2 text-xs text-zinc-500">
          the supabase backend hasn&apos;t been configured for this deployment
        </p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {errorMsg}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white">no entries yet</p>
        <p className="mt-2 text-xs text-zinc-500">be the first</p>
      </div>
    );
  }
  return (
    <>
      <ol className="flex flex-col gap-2">
        {entries.map((row, i) => (
          <ScanRow key={row.id} row={row} rank={i + 1} />
        ))}
      </ol>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center pt-6 pb-2"
        >
          <span className="text-xs text-zinc-500">
            {loadingMore ? 'loading more…' : 'scroll for more'}
          </span>
        </div>
      )}
      {!hasMore && (
        <p className="pt-6 pb-2 text-center text-xs text-zinc-600">
          end of leaderboard
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
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {errorMsg}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white">no battles yet</p>
        <p className="mt-2 text-xs text-zinc-500">queue up to climb the ladder</p>
      </div>
    );
  }
  return (
    <>
      <ol className="flex flex-col gap-2">
        {entries.map((row, i) => (
          <BattleRow key={row.user_id} row={row} rank={i + 1} />
        ))}
      </ol>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center pt-6 pb-2"
        >
          <span className="text-xs text-zinc-500">
            {loadingMore ? 'loading more…' : 'scroll for more'}
          </span>
        </div>
      )}
      {!hasMore && (
        <p className="pt-6 pb-2 text-center text-xs text-zinc-600">
          end of leaderboard
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
  // Smart cosmetics on the scan-leaderboard row know the user's best
  // overall (= row.overall) and their current_streak / matches_won
  // (from the profile JOIN). Smart cosmetics with no available data
  // (e.g., name.callout needs weakestSubScore — not fetched here)
  // gracefully render their empty state.
  const userStats: UserStats = {
    bestScanOverall: row.overall,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
    matchesWon: row.matches_won ?? null,
  };
  return (
    <li>
      <Link
        href={`/@${row.name}`}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
      >
        <div className="w-7 text-right font-num text-sm font-semibold text-zinc-500 tabular-nums">
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
  // Battle leaderboard knows elo + matches_won + current_streak.
  // name.elo-king renders here. name.streak-flame renders here.
  // bestScanOverall / weakestSubScore not available — smart fx that
  // need those render empty state.
  const userStats: UserStats = {
    elo: row.elo,
    matchesWon: row.matches_won,
    currentStreak: row.current_streak ?? null,
    currentWinStreak: row.current_streak ?? null,
  };
  return (
    <li>
      <Link
        href={`/@${row.display_name}`}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
      >
        <div className="w-7 text-right font-num text-sm font-semibold text-zinc-500 tabular-nums">
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
