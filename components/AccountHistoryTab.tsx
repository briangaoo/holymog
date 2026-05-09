'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Users } from 'lucide-react';
import { getScoreColor } from '@/lib/scoreColor';
import { getTier } from '@/lib/tier';

type Opponent = {
  user_id: string;
  display_name: string;
  peak_score: number;
};

type HistoryEntry = {
  battle_id: string;
  kind: 'public' | 'private';
  finished_at: string | null;
  is_winner: boolean;
  peak_score: number;
  opponents: Opponent[];
};

type Status = 'loading' | 'ready' | 'error';

const PAGE_SIZE = 20;

export function AccountHistoryTab() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [lastLoadedPage, setLastLoadedPage] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(async (page: number) => {
    try {
      const res = await fetch(`/api/account/history?page=${page}`, {
        cache: 'no-store',
      });
      return (await res.json()) as {
        entries?: HistoryEntry[];
        hasMore?: boolean;
        error?: string;
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchPage(1);
      if (cancelled) return;
      if (!data) {
        setStatus('error');
        setErrorMsg('network error');
        return;
      }
      if (data.error || !data.entries) {
        setStatus('error');
        setErrorMsg(data.error ?? 'unknown error');
        return;
      }
      setEntries(data.entries);
      setHasMore(!!data.hasMore);
      setLastLoadedPage(1);
      setStatus('ready');
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

  if (status === 'loading') {
    return <p className="text-sm text-zinc-500">loading…</p>;
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <Swords size={28} className="text-zinc-500" aria-hidden />
        <div>
          <p className="text-sm text-white">no battles yet</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            queue up a 1v1 or start a private party — your past battles will
            show up here with opponent, score, and result.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <HistoryRow key={e.battle_id} entry={e} />
      ))}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center pt-4 pb-2"
        >
          <span className="text-xs text-zinc-500">
            {loadingMore ? 'loading more…' : 'scroll for more'}
          </span>
        </div>
      )}
      {!hasMore && entries.length >= PAGE_SIZE && (
        <p className="pt-4 pb-2 text-center text-xs text-zinc-600">
          end of history
        </p>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const tier = getTier(entry.peak_score);
  const tierStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color: tier.color };
  const scoreColor = getScoreColor(entry.peak_score);

  // Build the opponent label. 1 opponent → name. >1 (private parties) →
  // "name + N others".
  const opponentLabel = (() => {
    if (entry.opponents.length === 0) return '—';
    if (entry.opponents.length === 1) return entry.opponents[0].display_name;
    const first = entry.opponents[0].display_name;
    return `${first} + ${entry.opponents.length - 1} others`;
  })();

  const date = entry.finished_at ? new Date(entry.finished_at) : null;
  const dateLabel = date
    ? date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
        entry.is_winner
          ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div
        aria-hidden
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          entry.kind === 'private'
            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border border-white/10 bg-white/5 text-zinc-300'
        }`}
        title={entry.kind === 'private' ? 'private party' : 'public 1v1'}
      >
        {entry.kind === 'private' ? <Users size={14} /> : <Swords size={14} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            vs {opponentLabel}
          </span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] ${
              entry.is_winner
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-white/10 text-zinc-400'
            }`}
          >
            {entry.is_winner ? 'win' : 'loss'}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500">{dateLabel}</div>
      </div>

      <div className="text-right">
        <div className="flex items-baseline gap-1">
          <span
            className="font-num text-lg font-extrabold leading-none tabular-nums"
            style={{ color: scoreColor }}
          >
            {entry.peak_score}
          </span>
          <span
            className="font-num text-xs font-bold normal-case leading-none"
            style={tierStyle}
          >
            {tier.letter}
          </span>
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-zinc-500">
          peak
        </div>
      </div>
    </div>
  );
}
