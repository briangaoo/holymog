'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import type { LeaderboardRow } from '@/lib/supabase';
import {
  readLeaderboardCache,
  writeLeaderboardCache,
} from '@/lib/leaderboardCache';

type Status = 'loading' | 'ready' | 'unconfigured' | 'error';

type ApiResponse = {
  entries?: LeaderboardRow[];
  hasMore?: boolean;
  error?: string;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [lastLoadedPage, setLastLoadedPage] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against the IntersectionObserver firing while a fetch is in flight.
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number): Promise<ApiResponse | null> => {
      try {
        const res = await fetch(`/api/leaderboard?page=${page}`, {
          cache: 'no-store',
        });
        return (await res.json()) as ApiResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  // Initial hydration: cache first (instant), then refresh page 1 in the
  // background so we don't show stale data for too long.
  useEffect(() => {
    let cancelled = false;
    const cached = readLeaderboardCache();
    if (cached) {
      setEntries(cached.entries);
      setHasMore(cached.hasMore);
      setLastLoadedPage(1);
      setStatus('ready');
    }

    (async () => {
      const data = await fetchPage(1);
      if (cancelled || !data) {
        if (!cached) {
          setStatus('error');
          setErrorMsg('network error');
        }
        return;
      }
      if (data.error === 'unconfigured') {
        setStatus('unconfigured');
        return;
      }
      if (data.error || !data.entries) {
        if (!cached) {
          setStatus('error');
          setErrorMsg(data.error ?? 'unknown error');
        }
        return;
      }
      setEntries(data.entries);
      setHasMore(!!data.hasMore);
      setLastLoadedPage(1);
      setStatus('ready');
      writeLeaderboardCache(data.entries, !!data.hasMore);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore || status !== 'ready') return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const next = lastLoadedPage + 1;
    const data = await fetchPage(next);
    fetchingRef.current = false;
    setLoadingMore(false);
    if (!data || data.error || !data.entries) {
      // soft-fail, leave hasMore as-is so user can scroll again to retry
      return;
    }
    setEntries((prev) => [...prev, ...data.entries!]);
    setHasMore(!!data.hasMore);
    setLastLoadedPage(next);
  }, [fetchPage, hasMore, lastLoadedPage, status]);

  // Infinite scroll: trigger loadMore when the sentinel enters the viewport.
  useEffect(() => {
    if (status !== 'ready' || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, hasMore, loadMore]);

  return (
    <div
      className="relative min-h-dvh bg-black px-5 pb-12"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
    >
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
          aria-label="Back"
        >
          <ChevronLeft size={16} aria-hidden />
          back
        </Link>
        <span className="font-mono text-sm lowercase text-white">holymog</span>
        <span className="w-12" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Top scores. Sorted by overall.
        </p>

        {status === 'loading' && (
          <p className="text-sm text-zinc-500">loading…</p>
        )}

        {status === 'unconfigured' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white">leaderboard not yet available</p>
            <p className="mt-2 text-xs text-zinc-500">
              the supabase backend hasn&apos;t been configured for this deployment
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        {status === 'ready' && entries.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white">no entries yet</p>
            <p className="mt-2 text-xs text-zinc-500">be the first</p>
          </div>
        )}

        {status === 'ready' && entries.length > 0 && (
          <>
            <ol className="flex flex-col gap-2">
              {entries.map((row, i) => (
                <Row key={row.id} row={row} rank={i + 1} />
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
        )}
      </main>
    </div>
  );
}

/** Deterministic colored circle with the user's first letter, same name
 *  always produces the same color (hash → hue). */
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
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </div>
  );
}

function Row({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const tier = getTier(row.overall);
  const isGradient = tier.isGradient;
  const tierStyle: React.CSSProperties = isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color: tier.color };
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="w-7 text-right font-num text-sm font-semibold text-zinc-500 tabular-nums">
        {rank}
      </div>
      {row.image_url ? (
        <img
          src={row.image_url}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-full border border-white/10 object-cover"
          loading="lazy"
        />
      ) : (
        <InitialAvatar name={row.name} />
      )}
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-white">{row.name}</div>
        <div className="text-[11px] text-zinc-500">
          J {row.jawline} · E {row.eyes} · S {row.skin} · C {row.cheekbones}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-num text-2xl font-extrabold leading-none normal-case"
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
    </li>
  );
}
