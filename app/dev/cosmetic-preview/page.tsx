'use client';

import { useState } from 'react';
import type { UserStats } from '@/lib/customization';
import { FramesSection } from './sections/FramesSection';
import { BadgesSection } from './sections/BadgesSection';
import { NameFxSection } from './sections/NameFxSection';
import { ThemesSection } from './sections/ThemesSection';

/**
 * /dev/cosmetic-preview — dev-only verification surface for the 60 cosmetic
 * components. Walks down every kind so we can eyeball each one. Mock
 * userStats toggle drives smart cosmetics through low/mid/high values.
 *
 * Dev-only: returns 404-style placeholder in production so we don't ship a
 * public verification page.
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
            60 components · 16 frames · 15 badges · 14 name fx · 15 themes
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
        <Section title="frames" count={16}>
          <FramesSection userStats={userStats} />
        </Section>
        <Section title="badges" count={15}>
          <BadgesSection userStats={userStats} />
        </Section>
        <Section title="name fx" count={14}>
          <NameFxSection userStats={userStats} />
        </Section>
        <Section title="themes" count={15}>
          <ThemesSection userStats={userStats} />
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold uppercase tracking-[0.16em] text-white">
          {title}
        </h2>
        <span className="font-num text-[11px] tabular-nums text-zinc-500">
          {count} items
        </span>
        <span aria-hidden className="ml-auto h-px flex-1 bg-white/10" />
      </header>
      {children}
    </section>
  );
}
