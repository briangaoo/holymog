'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
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
