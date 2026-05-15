'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Camera, Swords, Trophy } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

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

  return (
    <div className="relative h-dvh overflow-hidden bg-black">
      {/* Two ambient color washes anchored to the corners — soft
          enough that they read as atmosphere rather than gradient.
          Emerald pulls the eye to the SCAN tile, amber to the
          BATTLES tile. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 18% 30%, rgba(16,185,129,0.18) 0%, transparent 45%), radial-gradient(circle at 82% 70%, rgba(251,146,60,0.18) 0%, transparent 45%)',
        }}
      />

      <div className="relative z-10 flex h-dvh flex-col">
        <AppHeader />
        <main
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-6 sm:max-w-2xl"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 48px)' }}
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <HomeCard
              href="/scan"
              icon={<Camera size={18} aria-hidden />}
              kicker="01 · Solo"
              title="Scan"
              subtitle="Rate your face"
              meta="F− → S+"
              accent="emerald"
            />
            <HomeCard
              href="/mog"
              icon={<Swords size={18} aria-hidden />}
              kicker="02 · Multiplayer"
              title="Battles"
              subtitle="Live face-offs"
              meta="1v1 or up to 10"
              accent="amber"
            />
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <Link
            href="/leaderboard"
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-violet-500/25 bg-gradient-to-r from-violet-500/[0.04] via-black to-fuchsia-500/[0.04] px-5 py-4 text-sm text-white transition-all duration-300 hover:border-violet-400/60 hover:shadow-[0_0_28px_-4px_rgba(168,85,247,0.45)]"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="flex items-center gap-2.5">
              <Trophy
                size={15}
                aria-hidden
                className="text-violet-300 transition-transform duration-300 group-hover:scale-110"
              />
              <span className="font-medium">Leaderboard</span>
            </span>
            <ArrowUpRight
              size={16}
              aria-hidden
              className="text-white/60 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-violet-200"
            />
          </Link>

          <footer className="mt-8 flex flex-col items-center gap-2 text-[10px] text-white/40">
            <div className="flex items-center justify-center gap-3">
              <Link href="/account" className="transition-colors hover:text-white">
                Account
              </Link>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <Link href="/terms" className="transition-colors hover:text-white">
                Terms
              </Link>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <Link
                href="/privacy"
                className="transition-colors hover:text-white"
              >
                Privacy
              </Link>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <Link href="/help" className="transition-colors hover:text-white">
                Help
              </Link>
              <span aria-hidden className="text-white/20">
                ·
              </span>
              <a
                href="https://github.com/holymog/holymog"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                GitHub
              </a>
            </div>
            <span className="text-[10px] text-white/25">© 2026 holymog</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

const ACCENTS = {
  emerald: {
    border: 'border-emerald-500/30',
    hoverBorder: 'hover:border-emerald-400/70',
    glow: 'hover:shadow-[0_0_44px_-6px_rgba(16,185,129,0.55)]',
    icon: 'text-emerald-300',
    titleHover: 'group-hover:text-emerald-200',
    gradient:
      'bg-gradient-to-br from-emerald-500/[0.07] via-black to-black',
    kicker: 'text-emerald-300/80',
  },
  amber: {
    border: 'border-amber-500/30',
    hoverBorder: 'hover:border-amber-400/70',
    glow: 'hover:shadow-[0_0_44px_-6px_rgba(251,146,60,0.55)]',
    icon: 'text-amber-300',
    titleHover: 'group-hover:text-amber-200',
    gradient: 'bg-gradient-to-br from-amber-500/[0.07] via-black to-black',
    kicker: 'text-amber-300/80',
  },
} as const;

/**
 * Single tile on the home grid. Inherits an accent palette
 * (emerald for SCAN, amber for BATTLES) that drives the border tint,
 * the hover glow, the icon colour, and a soft gradient wash in the
 * corner. The brutalist hard-edge feeling is gone — these are now
 * inviting, almost button-like surfaces with motion + warmth on
 * hover. Sentence case copy throughout; only F−/S+ tier letters
 * stay literal because the tier system is upper-case by definition.
 */
function HomeCard({
  href,
  icon,
  kicker,
  title,
  subtitle,
  meta,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: string;
  meta: string;
  accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <Link
      href={href}
      className={`group relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-xl border ${a.border} ${a.hoverBorder} ${a.glow} ${a.gradient} p-6 transition-all duration-300 hover:-translate-y-0.5 sm:min-h-[360px] sm:p-7`}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Top row: icon-pill + kicker text on the left, arrow on the
          right. Arrow lifts on hover. */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${a.border} bg-black/40 backdrop-blur-sm ${a.icon} transition-transform duration-300 group-hover:scale-110`}
          >
            {icon}
          </span>
          <span className={`text-[11px] font-medium ${a.kicker}`}>
            {kicker}
          </span>
        </div>
        <ArrowUpRight
          size={18}
          aria-hidden
          className="text-white/60 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2
          className={`text-5xl font-bold leading-[0.92] tracking-tight text-white transition-colors duration-300 sm:text-6xl ${a.titleHover}`}
        >
          {title}
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-white/75">{subtitle}</p>
          <p className="text-[11px] text-white/45">{meta}</p>
        </div>
      </div>
    </Link>
  );
}
