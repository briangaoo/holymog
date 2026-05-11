'use client';

import { useState } from 'react';
import type { UserStats } from '@/lib/customization';
import { NameFxSection } from './sections/NameFxSection';

/**
 * /dev/cosmetic-preview — dev-only verification surface for the 10
 * Launch 1 cosmetic components (all name fx). Mock userStats toggle
 * drives smart cosmetics through low/mid/high values.
 *
 * Dev-only: returns a placeholder in production so we don't ship the
 * verification surface publicly. Frames, badges, and themes deferred
 * to Launch 2 — no preview sections for them yet.
 */

const MOCK_STATS: Record<'low' | 'mid' | 'high', UserStats> = {
  low: {
    elo: 950,
    bestScanOverall: 42,
    currentStreak: 1,
    currentWinStreak: 1,
    matchesWon: 2,
    weakestSubScore: 'skin',
  },
  mid: {
    elo: 1240,
    bestScanOverall: 74,
    currentStreak: 5,
    currentWinStreak: 5,
    matchesWon: 14,
    weakestSubScore: 'jawline',
  },
  high: {
    elo: 1620,
    bestScanOverall: 96,
    currentStreak: 18,
    currentWinStreak: 18,
    matchesWon: 47,
    weakestSubScore: 'eyes',
  },
};

export default function CosmeticPreviewPage() {
  const [level, setLevel] = useState<'low' | 'mid' | 'high'>('mid');
  const userStats = MOCK_STATS[level];

  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black text-zinc-500">
        not available
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black px-6 py-10 text-white">
      <header className="sticky top-0 z-50 -mx-6 mb-10 flex items-center justify-between border-b border-white/10 bg-black/85 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold tracking-tight">cosmetic preview</h1>
          <span className="text-[11px] text-zinc-500">
            10 components · 10 name fx · frames + badges + themes deferred to launch 2
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
          {(['low', 'mid', 'high'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setLevel(opt)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                level === opt
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {opt} stats
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-16">
        <NameFxSection userStats={userStats} />
      </div>
    </main>
  );
}
