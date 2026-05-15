'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Trophy } from 'lucide-react';
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
      <div className="relative z-10 flex h-dvh flex-col">
        <AppHeader />
        <main
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-6 sm:max-w-2xl"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 48px)' }}
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <HomeCard
              href="/scan"
              index="01"
              title="SCAN"
              subtitle="RATE YOUR FACE"
              meta="F- → S+"
              accent={SCAN_ACCENT}
              glowOrigin="top-right"
            />
            <HomeCard
              href="/mog"
              index="02"
              title="BATTLES"
              subtitle="LIVE FACE-OFFS"
              meta="1V1 OR UP TO 10"
              accent={BATTLE_ACCENT}
              glowOrigin="bottom-left"
            />
          </div>

          <div className="my-5 h-px bg-white/15" />

          <Link
            href="/leaderboard"
            className="group relative flex items-center justify-between overflow-hidden border-2 bg-black px-5 py-4 text-sm uppercase tracking-[0.18em] text-white transition-all"
            style={{
              touchAction: 'manipulation',
              borderRadius: 2,
              borderColor: `${LEADERBOARD_ACCENT}80`,
            }}
          >
            {/* Amber glow from the right edge — leaderboard = trophy warmth */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${LEADERBOARD_ACCENT}55 0%, ${LEADERBOARD_ACCENT}15 40%, transparent 70%)`,
              }}
            />
            <span className="relative inline-flex items-center gap-2.5 font-medium">
              <Trophy size={14} aria-hidden style={{ color: LEADERBOARD_ACCENT }} />
              LEADERBOARD
            </span>
            <ArrowUpRight
              size={16}
              aria-hidden
              className="relative transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              style={{ color: LEADERBOARD_ACCENT }}
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

// Brand accent hex tokens. Centralised here so per-tile + leaderboard
// pull from the same source.
//   scan       = emerald-500 — "go", scan-flow signature (also the
//                spiderweb-dot colour on /scan)
//   battles    = sky-400 — competitive, live, electric
//   leaderboard = amber-400 — trophy warmth, distinct from the two
//                 primary actions above
const SCAN_ACCENT = '#10b981';
const BATTLE_ACCENT = '#38bdf8';
const LEADERBOARD_ACCENT = '#fbbf24';

/**
 * Single brutalist tile on the home grid. Numbered (01, 02) up top,
 * uppercase title + subtitle, meta line at the bottom, arrow pulls
 * up-right on hover. Brand accent drives:
 *   - the 2px border (full-saturation hex, hover brightens)
 *   - an off-frame radial glow blob behind the card (corner-anchored
 *     per the glowOrigin prop)
 *   - the index number + arrow icon (lighter accent tint)
 * The title itself stays white so the typography reads first; the
 * accent is the supporting voice.
 */
function HomeCard({
  href,
  index,
  title,
  subtitle,
  meta,
  accent,
  glowOrigin,
}: {
  href: string;
  index: string;
  title: string;
  subtitle: string;
  meta: string;
  accent: string;
  glowOrigin: 'top-right' | 'bottom-left';
}) {
  const glowClass =
    glowOrigin === 'top-right'
      ? '-right-20 -top-20'
      : '-bottom-20 -left-20';
  return (
    <Link
      href={href}
      className="group relative flex min-h-[300px] flex-col justify-between overflow-hidden border-2 bg-black p-6 transition-colors hover:bg-white/[0.02] sm:min-h-[360px] sm:p-7"
      style={{
        touchAction: 'manipulation',
        borderRadius: 2,
        borderColor: `${accent}80`,
      }}
    >
      {/* Off-frame accent glow — anchored to the corner specified by
          glowOrigin so the two cards bounce light off each other when
          set on the same row. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute ${glowClass} h-[18rem] w-[18rem] rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100`}
        style={{
          background: `radial-gradient(circle, ${accent}55 0%, ${accent}20 35%, transparent 65%)`,
          opacity: 0.7,
        }}
      />
      {/* Inner top sheen for subtle depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28%]"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
        }}
      />

      <div className="relative flex items-start justify-between">
        <span
          className="font-mono text-[11px] font-medium tracking-[0.2em]"
          style={{ color: accent }}
        >
          {index}
        </span>
        <ArrowUpRight
          size={18}
          aria-hidden
          className="transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          style={{ color: accent }}
        />
      </div>

      <div className="relative flex flex-col gap-3">
        <h2 className="text-5xl font-bold uppercase leading-[0.92] tracking-tight text-white sm:text-6xl">
          {title}
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">
            {subtitle}
          </p>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: `${accent}cc` }}
          >
            {meta}
          </p>
        </div>
      </div>
    </Link>
  );
}
