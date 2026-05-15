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
      {/* Two soft white washes anchored to the corners. Black-with-
          white-glow only — colour was making the homepage look like
          a generic crypto landing page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 18% 28%, rgba(255,255,255,0.06) 0%, transparent 45%), radial-gradient(circle at 82% 72%, rgba(255,255,255,0.05) 0%, transparent 48%)',
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
            />
            <HomeCard
              href="/mog"
              icon={<Swords size={18} aria-hidden />}
              kicker="02 · Multiplayer"
              title="Battles"
              subtitle="Live face-offs"
              meta="1v1 or up to 10"
            />
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <Link
            href="/leaderboard"
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-white/20 bg-white/[0.02] px-5 py-4 text-sm text-white transition-all duration-300 hover:border-white/60 hover:bg-white/[0.05] hover:shadow-[0_0_32px_-4px_rgba(255,255,255,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="flex items-center gap-2.5">
              <Trophy
                size={15}
                aria-hidden
                className="text-white/80 transition-all duration-300 group-hover:scale-110 group-hover:text-white"
              />
              <span className="font-medium">Leaderboard</span>
            </span>
            <ArrowUpRight
              size={16}
              aria-hidden
              className="text-white/60 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
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

/**
 * Single tile on the home grid. Brutalist back-to-basics: black card,
 * 1px white border, an icon-pill + numbered kicker on top, big title +
 * subtitle below. The whole tile lifts 2px on hover and pulls in a
 * heavier white halo via box-shadow so the elevation is felt without
 * any accent colour. The brand voice carries the visual weight here.
 */
function HomeCard({
  href,
  icon,
  kicker,
  title,
  subtitle,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-white/[0.03] via-black to-black p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60 hover:shadow-[0_0_56px_-8px_rgba(255,255,255,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)] sm:min-h-[360px] sm:p-7"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Top row: icon-pill + kicker text on the left, arrow on the
          right. Arrow lifts on hover. */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] text-white/90 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:border-white/50 group-hover:bg-white/[0.08] group-hover:text-white">
            {icon}
          </span>
          <span className="text-[11px] font-medium text-white/55">
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
        <h2 className="text-5xl font-bold leading-[0.92] tracking-tight text-white transition-all duration-300 group-hover:[text-shadow:0_0_28px_rgba(255,255,255,0.45)] sm:text-6xl">
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
