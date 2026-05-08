'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Camera, Swords, Trophy } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import type { FinalScores } from '@/types';

const STORAGE_KEY = 'holymog-last-result';

type SavedResult = { scores: FinalScores; capturedImage: string; ts: number };

function loadLastResult(): SavedResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedResult>;
    if (
      !parsed.scores ||
      typeof parsed.capturedImage !== 'string' ||
      typeof parsed.scores.overall !== 'number'
    ) {
      return null;
    }
    return parsed as SavedResult;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [lastResult, setLastResult] = useState<SavedResult | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLastResult(loadLastResult());
    setHydrated(true);
  }, []);

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main
        className="mx-auto w-full max-w-md px-5 pb-12 pt-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 48px)' }}
      >
        <div className="flex flex-col gap-4">
          <ScanCard lastResult={hydrated ? lastResult : null} />
          <BattleCard />
        </div>

        <div className="my-6 h-px bg-white/10" />

        <Link
          href="/leaderboard"
          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition-colors hover:bg-white/[0.05]"
          style={{ touchAction: 'manipulation' }}
        >
          <span className="inline-flex items-center gap-3 text-sm font-medium text-white">
            <Trophy size={16} aria-hidden className="text-zinc-400" />
            leaderboard
          </span>
          <ArrowRight
            size={14}
            aria-hidden
            className="text-zinc-500 transition-transform group-hover:translate-x-0.5"
          />
        </Link>

        <footer className="mt-10 flex items-center justify-center gap-3 text-[11px] text-zinc-600">
          <Link href="/account" className="hover:text-zinc-400">
            account
          </Link>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/briangaoo/holymog"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-400"
          >
            github
          </a>
        </footer>
      </main>
    </div>
  );
}

function ScanCard({ lastResult }: { lastResult: SavedResult | null }) {
  const tier = lastResult ? getTier(lastResult.scores.overall) : null;
  const scoreColor = lastResult ? getScoreColor(lastResult.scores.overall) : null;

  const tierStyle: React.CSSProperties | undefined = tier
    ? tier.isGradient
      ? {
          backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }
      : { color: tier.color }
    : undefined;

  return (
    <Link
      href="/scan"
      className="group relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-white/10 p-6 transition-all hover:border-white/25"
      style={{
        background:
          'linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(168,85,247,0.18) 100%)',
        touchAction: 'manipulation',
      }}
    >
      {/* corner accent */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Camera size={32} aria-hidden className="text-white" />
          <h2 className="text-3xl font-bold text-white">scan</h2>
          <p className="text-sm text-zinc-200">
            rate your face <span className="font-semibold">F- → S+</span>
          </p>
        </div>
        <ArrowRight
          size={20}
          aria-hidden
          className="text-zinc-300 transition-transform group-hover:translate-x-1"
        />
      </div>

      {lastResult && tier && scoreColor && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            your last
          </span>
          <span
            className="font-num text-2xl font-extrabold normal-case"
            style={tierStyle}
          >
            {tier.letter}
          </span>
          <span className="text-zinc-600">·</span>
          <span
            className="font-num text-xl font-bold tabular-nums"
            style={{ color: scoreColor }}
          >
            {lastResult.scores.overall}
          </span>
        </div>
      )}

      <div className="inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
        start a scan
        <ArrowRight size={14} aria-hidden />
      </div>
    </Link>
  );
}

function BattleCard() {
  return (
    <Link
      href="/mog"
      className="group relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-white/10 p-6 transition-all hover:border-white/25"
      style={{
        background:
          'linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(249,115,22,0.14) 100%)',
        touchAction: 'manipulation',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ef4444 0%, transparent 70%)' }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Swords size={28} aria-hidden className="text-white" />
          <h2 className="text-2xl font-bold text-white">mog battles</h2>
          <p className="text-sm text-zinc-200">
            live face-offs <span className="text-zinc-500">·</span> 1v1 or up to 10
          </p>
        </div>
        <ArrowRight
          size={20}
          aria-hidden
          className="text-zinc-300 transition-transform group-hover:translate-x-1"
        />
      </div>

      <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white">
        find a battle
        <ArrowRight size={14} aria-hidden />
      </div>
    </Link>
  );
}
