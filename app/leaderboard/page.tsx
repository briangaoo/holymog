'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import type { LeaderboardRow } from '@/lib/supabase';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: LeaderboardRow[] }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string };

export default function LeaderboardPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        const data = (await res.json()) as {
          entries?: LeaderboardRow[];
          error?: string;
        };
        if (cancelled) return;
        if (data.error === 'unconfigured') {
          setState({ kind: 'unconfigured' });
        } else if (data.entries) {
          setState({ kind: 'ready', entries: data.entries });
        } else {
          setState({ kind: 'error', message: data.error ?? 'unknown error' });
        }
      } catch (e) {
        if (!cancelled) {
          setState({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <span className="font-mono text-sm lowercase text-white">mogem</span>
        <span className="w-12" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Top scores. Sorted by overall.
        </p>

        {state.kind === 'loading' && (
          <p className="text-sm text-zinc-500">loading…</p>
        )}

        {state.kind === 'unconfigured' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white">leaderboard not yet available</p>
            <p className="mt-2 text-xs text-zinc-500">
              the supabase backend hasn&apos;t been configured for this deployment
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {state.message}
          </div>
        )}

        {state.kind === 'ready' && state.entries.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white">no entries yet</p>
            <p className="mt-2 text-xs text-zinc-500">be the first</p>
          </div>
        )}

        {state.kind === 'ready' && state.entries.length > 0 && (
          <ol className="flex flex-col gap-2">
            {state.entries.map((row, i) => (
              <Row key={row.id} row={row} rank={i + 1} />
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

/** Deterministic colored circle with the user's first letter — same name
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
          className="font-num text-2xl font-extrabold leading-none"
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
