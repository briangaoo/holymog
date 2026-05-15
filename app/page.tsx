'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Crown, Flame } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

type HomeData = {
  activity: {
    scans_today: number;
    battles_live: number;
    s_tier_today: number;
    top_today: { display_name: string; score: number } | null;
  };
  me: {
    elo: number;
    current_streak: number;
    best_scan_overall: number | null;
    scans_today: number;
  } | null;
};

export default function HomePage() {
  // Lock browser-level scroll while the home page is mounted. Just
  // setting overflow-hidden on the page wrapper isn't enough — html/body
  // can still scroll independently — so we toggle their overflow here
  // and restore on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Fetch the live homepage data (activity + me) on mount. We don't
  // block the render — both the activity strip + me chip have a
  // "skeleton" state until the data lands, so the first paint is
  // instant and the strip animates in.
  //
  // Pass the browser's IANA timezone so "today" counters use the
  // user's local midnight instead of UTC midnight (otherwise a US
  // West Coast user sees their "today" reset at 5pm).
  const [home, setHome] = useState<HomeData | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tz =
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : 'UTC';
        const res = await fetch(`/api/home?tz=${encodeURIComponent(tz)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as HomeData;
        if (!cancelled) setHome(data);
      } catch {
        // best-effort — the chips render empty rather than blocking
        // the page if /api/home is down.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative h-dvh overflow-hidden bg-black">
      <div className="relative z-10 flex h-dvh flex-col">
        <AppHeader />
        <main
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-6 sm:max-w-2xl"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 48px)' }}
        >
          <ActivityStrip data={home?.activity ?? null} />
          <MeChip
            me={home?.me ?? null}
            topToday={home?.activity?.top_today ?? null}
          />

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <HomeCard
              href="/scan"
              index="01"
              title="SCAN"
              subtitle="RATE YOUR FACE"
              meta="F- → S+"
            />
            <HomeCard
              href="/mog"
              index="02"
              title="BATTLES"
              subtitle="LIVE FACE-OFFS"
              meta="1V1 OR UP TO 10"
            />
          </div>

          <div className="my-5 h-px bg-white/15" />

          <Link
            href="/leaderboard"
            className="group flex items-center justify-between border-2 border-white/30 bg-black px-5 py-4 text-sm uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
            style={{ touchAction: 'manipulation', borderRadius: 2 }}
          >
            <span className="font-medium">LEADERBOARD</span>
            <ArrowUpRight
              size={16}
              aria-hidden
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>

          <footer className="mt-8 flex flex-col items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
            <div className="flex items-center justify-center gap-3">
              <Link href="/account" className="hover:text-white">
                ACCOUNT
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <Link href="/terms" className="hover:text-white">
                TERMS
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <Link href="/privacy" className="hover:text-white">
                PRIVACY
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <Link href="/help" className="hover:text-white">
                HELP
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <a
                href="https://github.com/holymog/holymog"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                GITHUB
              </a>
            </div>
            <span className="text-[10px] text-white/25">© 2026 HOLYMOG</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

/**
 * Single brutalist tile on the home grid. Numbered (01, 02) up top,
 * uppercase title + subtitle, meta line at the bottom, arrow pulls
 * up-right on hover. No accent colours, no gradients, no glow — the
 * full brand commits to "the type IS the design" here.
 */
function HomeCard({
  href,
  index,
  title,
  subtitle,
  meta,
}: {
  href: string;
  index: string;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[300px] flex-col justify-between border-2 border-white/30 bg-black p-6 transition-colors hover:border-white hover:bg-white/[0.03] sm:min-h-[360px] sm:p-7"
      style={{ touchAction: 'manipulation', borderRadius: 2 }}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] font-medium tracking-[0.2em] text-white/50">
          {index}
        </span>
        <ArrowUpRight
          size={18}
          aria-hidden
          className="text-white/60 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-5xl font-bold uppercase leading-[0.92] tracking-tight text-white sm:text-6xl">
          {title}
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">
            {subtitle}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            {meta}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Live-activity strip — top of the homepage above the tiles. Reads
 * the global counters from /api/home so visitors see momentum:
 * scans/battles happening RIGHT NOW. Tiles themselves stay
 * monochrome per the brutalist brand — the colour lives ONLY on the
 * stat numbers here.
 *
 * Skeleton state when data hasn't loaded: render the chip frame
 * with em-dashes so the first paint is layout-stable.
 */
function ActivityStrip({
  data,
}: {
  data: HomeData['activity'] | null;
}) {
  const scans = data?.scans_today;
  const live = data?.battles_live;
  const sTier = data?.s_tier_today;
  const livePulse = (live ?? 0) > 0;
  return (
    <div
      className="mb-3 flex items-center gap-0 border-2 border-white/20 bg-black"
      style={{ borderRadius: 2 }}
    >
      <span className="inline-flex items-center gap-1.5 border-r-2 border-white/20 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white">
        <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
          {livePulse && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          )}
          <span
            className={`relative h-1.5 w-1.5 rounded-full ${
              livePulse ? 'bg-emerald-400' : 'bg-white/40'
            }`}
          />
        </span>
        LIVE
      </span>
      <ActivityChip
        label="scans"
        value={scans}
        accent="text-sky-300"
      />
      <ActivityChip
        label="battles"
        value={live}
        accent="text-emerald-300"
      />
      <ActivityChip
        label="s+"
        value={sTier}
        accent="text-amber-300"
        lastCell
      />
    </div>
  );
}

function ActivityChip({
  label,
  value,
  accent,
  lastCell,
}: {
  label: string;
  value: number | undefined;
  accent: string;
  lastCell?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 items-baseline justify-between gap-1 px-3 py-2.5 ${
        lastCell ? '' : 'border-r-2 border-white/20'
      }`}
    >
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </span>
      <span
        className={`font-num text-[16px] font-bold leading-none tabular-nums ${accent}`}
        style={{ textTransform: 'none' }}
      >
        {value == null ? '—' : value.toLocaleString('en-US')}
      </span>
    </div>
  );
}

/**
 * Personal snapshot chip. Signed-in users see THEIR ELO + streak +
 * best scan + today's scan count. Signed-out users see "today's
 * top scan" — a peek at the leaderboard without needing to navigate.
 *
 * Stat numbers carry colour (amber / emerald / violet); the chip
 * frame stays the same brutalist 2px-border-on-black so it sits
 * with the tiles without competing.
 */
function MeChip({
  me,
  topToday,
}: {
  me: HomeData['me'] | null;
  topToday: { display_name: string; score: number } | null;
}) {
  // Signed-out fallback: top scan of the day, linked to the user's
  // public profile. If nobody has scanned today, the chip is muted
  // copy instead of disappearing — keeps the layout stable.
  if (!me) {
    return (
      <div
        className="mb-5 flex items-center justify-between gap-3 border-2 border-white/20 bg-black px-4 py-3"
        style={{ borderRadius: 2 }}
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
          <Crown size={11} aria-hidden className="text-amber-300" />
          today&apos;s top scan
        </span>
        {topToday ? (
          <Link
            href={`/@${topToday.display_name}`}
            className="flex items-baseline gap-2 text-[13px] text-white hover:underline underline-offset-2"
          >
            <span className="truncate">@{topToday.display_name}</span>
            <span
              className="font-num text-base font-bold tabular-nums text-amber-300"
              style={{ textTransform: 'none' }}
            >
              {topToday.score}
            </span>
          </Link>
        ) : (
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            no scans yet today
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="mb-5 grid grid-cols-2 gap-px overflow-hidden border-2 border-white/20 bg-white/15 sm:grid-cols-4"
      style={{ borderRadius: 2 }}
    >
      <MeStat label="elo" value={String(me.elo)} accent="text-amber-300" />
      <MeStat
        label="streak"
        value={String(me.current_streak)}
        accent="text-emerald-300"
        icon={me.current_streak > 0 ? <Flame size={10} aria-hidden /> : null}
      />
      <MeStat
        label="best"
        value={me.best_scan_overall != null ? String(me.best_scan_overall) : '—'}
        accent="text-violet-300"
      />
      <MeStat
        label="today"
        value={String(me.scans_today)}
        accent="text-sky-300"
      />
    </div>
  );
}

function MeStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 bg-black px-3 py-2.5">
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/45">
        {icon}
        {label}
      </span>
      <span
        className={`font-num text-[18px] font-bold leading-none tabular-nums ${accent}`}
        style={{ textTransform: 'none' }}
      >
        {value}
      </span>
    </div>
  );
}
