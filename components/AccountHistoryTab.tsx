'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { History, Search, X } from 'lucide-react';
import { getScoreColor } from '@/lib/scoreColor';
import { getTier } from '@/lib/tier';
import { Section } from './account/settings/shared';

type Opponent = {
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

type HistorySummary = {
  total: number;
  won: number;
  lost: number;
  win_rate: number | null;
  peak: number | null;
};

type HistoryApiResponse = {
  entries?: HistoryEntry[];
  hasMore?: boolean;
  error?: string;
  summary?: HistorySummary;
};

type Status = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 20;

type KindFilter = 'all' | 'public' | 'private';
type ResultFilter = 'all' | 'won' | 'lost';

function deriveInitialStatus(
  initial: HistoryApiResponse | null | undefined,
): Status {
  if (initial == null) return 'loading';
  if (initial.error || !initial.entries) return 'error';
  return 'ready';
}

/**
 * History tab — filterable battle log + summary header.
 *
 * Filters are debounced into the URL query when fetching, and a Reset
 * pill appears when any filter is active. Summary header reflects the
 * current filtered set (counts + win-rate + peak), so the chips read
 * "X battles · Y won · Z% wr · best 84" for whatever you're looking at.
 *
 * Infinite scroll within the current filter via IntersectionObserver
 * sentinel; switching filters resets pagination.
 */
export function AccountHistoryTab({
  initial,
}: {
  initial?: HistoryApiResponse | null;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>(
    initial?.entries ?? [],
  );
  const [summary, setSummary] = useState<HistorySummary | null>(
    initial?.summary ?? null,
  );
  const [hasMore, setHasMore] = useState(!!initial?.hasMore);
  const [lastLoadedPage, setLastLoadedPage] = useState(initial?.entries ? 1 : 0);
  const [status, setStatus] = useState<Status>(() =>
    deriveInitialStatus(initial),
  );
  const [errorMsg, setErrorMsg] = useState(initial?.error ?? '');
  const [loadingMore, setLoadingMore] = useState(false);

  const [kind, setKind] = useState<KindFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [opponent, setOpponent] = useState('');

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const buildUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (kind !== 'all') params.set('kind', kind);
      if (resultFilter !== 'all') params.set('result', resultFilter);
      const oppTrim = opponent.trim().toLowerCase();
      if (oppTrim) params.set('opponent', oppTrim);
      return `/api/account/history?${params.toString()}`;
    },
    [kind, resultFilter, opponent],
  );

  const fetchPage = useCallback(
    async (page: number): Promise<HistoryApiResponse | null> => {
      try {
        const res = await fetch(buildUrl(page), { cache: 'no-store' });
        return (await res.json()) as HistoryApiResponse;
      } catch {
        return null;
      }
    },
    [buildUrl],
  );

  // Debounce + refetch from page 1 whenever filters change. Initial
  // mount uses the prefetched data when available, then refetches as
  // soon as a filter is touched.
  const filterKey = `${kind}|${resultFilter}|${opponent.trim().toLowerCase()}`;
  const initialKeyRef = useRef('all|all|');
  const skipFirstFetchRef = useRef(initial != null);
  useEffect(() => {
    if (skipFirstFetchRef.current && filterKey === initialKeyRef.current) {
      // Initial render with prefetched data + default filters → no
      // refetch needed. Subsequent changes always refetch.
      skipFirstFetchRef.current = false;
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setStatus('loading');
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
      setSummary(data.summary ?? null);
      setHasMore(!!data.hasMore);
      setLastLoadedPage(1);
      setStatus('ready');
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [filterKey, fetchPage]);

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

  const filtersActive = useMemo(
    () => kind !== 'all' || resultFilter !== 'all' || opponent.trim() !== '',
    [kind, resultFilter, opponent],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Filter section. */}
      <Section
        id="history-filters"
        label="battle history"
        description="filter by type, result, or opponent."
        icon={History}
        accent="purple"
        meta={
          filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setKind('all');
                setResultFilter('all');
                setOpponent('');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.07] hover:text-white"
            >
              <X size={11} aria-hidden /> reset
            </button>
          ) : null
        }
      >
        {/* Kind + result pill rows */}
        <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-zinc-500">type</span>
            {(
              [
                ['all', 'all'],
                ['public', '1v1'],
                ['private', 'private'],
              ] as Array<[KindFilter, string]>
            ).map(([k, label]) => (
              <FilterChip
                key={k}
                active={kind === k}
                onClick={() => setKind(k)}
                accent="purple"
              >
                {label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-zinc-500">result</span>
            {(
              [
                ['all', 'all'],
                ['won', 'wins'],
                ['lost', 'losses'],
              ] as Array<[ResultFilter, string]>
            ).map(([r, label]) => (
              <FilterChip
                key={r}
                active={resultFilter === r}
                onClick={() => setResultFilter(r)}
                accent={
                  r === 'won' ? 'emerald' : r === 'lost' ? 'rose' : 'purple'
                }
              >
                {label}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] focus-within:border-purple-500/40 focus-within:ring-2 focus-within:ring-purple-500/15">
            <span className="flex items-center pl-3 pr-1 text-zinc-500">
              <Search size={13} aria-hidden />
            </span>
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value.slice(0, 24))}
              placeholder="search opponent"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent py-2 pr-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
            />
            {opponent && (
              <button
                type="button"
                onClick={() => setOpponent('')}
                className="px-2 text-zinc-500 hover:text-white"
              >
                <X size={13} aria-hidden />
              </button>
            )}
          </div>
        </div>

        {/* Summary chips */}
        {summary && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3 text-[12px]">
            <SummaryChip
              label="battles"
              value={String(summary.total)}
              color="text-white"
            />
            {summary.total > 0 && (
              <>
                <SummaryChip
                  label="won"
                  value={String(summary.won)}
                  color="text-emerald-300"
                />
                <SummaryChip
                  label="lost"
                  value={String(summary.lost)}
                  color="text-rose-300"
                />
                {summary.win_rate !== null && (
                  <SummaryChip
                    label="win rate"
                    value={`${summary.win_rate}%`}
                    color={
                      summary.win_rate >= 50
                        ? 'text-emerald-300'
                        : 'text-zinc-200'
                    }
                  />
                )}
                {summary.peak !== null && (
                  <SummaryChip
                    label="best peak"
                    value={String(summary.peak)}
                    color="text-sky-300"
                  />
                )}
              </>
            )}
          </div>
        )}
      </Section>

      {/* Results section. */}
      {status === 'loading' && entries.length === 0 ? (
        <Section
          label="results"
          description="battles matching your filters."
          icon={History}
          accent="zinc"
        >
          <div className="border-t border-white/5 px-4 py-4 text-[13px] text-zinc-500">
            loading…
          </div>
        </Section>
      ) : status === 'error' ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-3 text-[13px] text-red-300">
          {errorMsg}
        </div>
      ) : entries.length === 0 ? (
        <Section
          label="results"
          description="battles matching your filters."
          icon={History}
          accent="zinc"
        >
          <div className="border-t border-white/5 px-4 py-6 text-center">
            <p className="text-[13px] text-zinc-300">
              {filtersActive ? 'no battles match' : 'no battles yet'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {filtersActive
                ? 'try clearing the filters'
                : 'queue up a battle to populate this'}
            </p>
          </div>
        </Section>
      ) : (
        <Section
          label="results"
          description={`${entries.length} of ${summary?.total ?? entries.length} shown.`}
          icon={History}
          accent="zinc"
        >
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <HistoryRow key={entry.battle_id} entry={entry} />
            ))}
          </ul>
          {hasMore && (
            <div
              ref={sentinelRef}
              className="border-t border-white/5 px-4 py-3 text-center"
            >
              <span className="text-[11px] text-zinc-500">
                {loadingMore ? 'loading…' : 'scroll for more'}
              </span>
            </div>
          )}
          {!hasMore && entries.length >= PAGE_SIZE && (
            <div className="border-t border-white/5 px-4 py-3 text-center">
              <span className="text-[11px] text-zinc-500">end of history</span>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ---- Sub-components ------------------------------------------------------

function FilterChip({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent: 'purple' | 'emerald' | 'rose';
  children: React.ReactNode;
}) {
  const activeStyles =
    accent === 'emerald'
      ? 'border-emerald-500/40 bg-emerald-500/[0.10] text-emerald-200'
      : accent === 'rose'
        ? 'border-rose-500/40 bg-rose-500/[0.10] text-rose-200'
        : 'border-purple-500/40 bg-purple-500/[0.10] text-purple-200';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: 'manipulation' }}
      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
        active
          ? activeStyles
          : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className={`font-num text-[12px] font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </span>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const tier = getTier(entry.peak_score);
  const scoreColor = getScoreColor(entry.peak_score);

  const opponentNode = (() => {
    if (entry.opponents.length === 0) return <>—</>;
    const first = entry.opponents[0];
    const extra = entry.opponents.length - 1;
    return (
      <>
        <Link
          href={`/@${first.display_name}`}
          className="text-zinc-200 hover:text-white hover:underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {first.display_name}
        </Link>
        {extra > 0 && <span className="text-zinc-500"> +{extra}</span>}
      </>
    );
  })();

  const date = entry.finished_at ? new Date(entry.finished_at) : null;
  const dateLabel = date
    ? date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '—';

  return (
    <li className="flex items-center gap-3 border-t border-white/5 px-4 py-3 text-[13px] transition-colors hover:bg-white/[0.015]">
      <span
        className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
          entry.is_winner
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/15 text-rose-300'
        }`}
      >
        {entry.is_winner ? 'W' : 'L'}
      </span>
      <span
        className={`text-[10px] uppercase tracking-[0.12em] ${
          entry.kind === 'private' ? 'text-amber-300/80' : 'text-zinc-500'
        } w-12`}
      >
        {entry.kind === 'private' ? 'priv' : '1v1'}
      </span>
      <span className="flex-1 truncate text-zinc-300">vs {opponentNode}</span>
      <span className="flex items-center gap-1 text-right">
        <span
          className="font-num text-[14px] font-semibold tabular-nums"
          style={{ color: scoreColor }}
        >
          {entry.peak_score}
        </span>
        <span
          className="font-num text-[11px] font-bold"
          style={tier.isGradient ? gradientStyle() : { color: tier.color }}
        >
          {tier.letter}
        </span>
      </span>
      <span className="font-num w-12 text-right text-[11px] tabular-nums text-zinc-500">
        {dateLabel}
      </span>
    </li>
  );
}

function gradientStyle(): React.CSSProperties {
  return {
    backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  };
}
