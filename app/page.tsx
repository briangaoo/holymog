'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Camera, Swords, Trophy } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Starfield } from '@/components/Starfield';
import { SpectralRim } from '@/components/SpectralRim';

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
      <Starfield />
      <div className="relative z-10 flex h-dvh flex-col">
        <AppHeader />
        <main
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-6 sm:max-w-2xl"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 48px)' }}
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <SpectralRim accent="rgba(16,185,129,0.95)" className="rounded-3xl">
              <ScanCard />
            </SpectralRim>
            <SpectralRim accent="rgba(245,158,11,0.95)" className="rounded-3xl">
              <BattleCard />
            </SpectralRim>
          </div>

          <div className="my-6 h-px bg-white/10" />

          <SpectralRim
            accent="rgba(34,211,238,0.6)"
            spotlight={80}
            className="rounded-2xl"
          >
            <Link
              href="/leaderboard"
              className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-5 py-4 backdrop-blur transition-colors hover:bg-white/[0.05]"
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
          </SpectralRim>

          <footer className="mt-10 flex flex-col items-center gap-2 text-[11px] text-zinc-600">
            <div className="flex items-center justify-center gap-3">
              <Link href="/account" className="hover:text-zinc-400">
                account
              </Link>
              <span aria-hidden>·</span>
              <Link href="/terms" className="hover:text-zinc-400">
                terms
              </Link>
              <span aria-hidden>·</span>
              <Link href="/privacy" className="hover:text-zinc-400">
                privacy
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
            </div>
            <span className="text-[10px] text-zinc-700">
              © 2026 holymog
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ScanCard() {
  return (
    <Link
      href="/scan"
      className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-3xl border border-white/10 p-8 transition-all hover:border-white/25"
      style={{
        backgroundColor: '#0a0a0a',
        // Emerald rim — scan's official accent.
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(16,185,129,0.22)',
        touchAction: 'manipulation',
      }}
    >
      {/* Off-frame green radial — the spot light behind the frosted glass. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.95) 0%, rgba(34,197,94,0.45) 35%, transparent 65%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-2xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 35%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Camera size={44} aria-hidden className="text-white drop-shadow-lg" />
          <h2 className="text-5xl font-bold leading-none tracking-tight text-white">
            scan
          </h2>
          <p className="text-base text-white/85">
            rate your face{' '}
            <span className="font-semibold normal-case">F- → S+</span>
          </p>
        </div>
        <ArrowRight
          size={22}
          aria-hidden
          className="text-white/80 transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function BattleCard() {
  return (
    <Link
      href="/mog"
      className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-3xl border border-white/10 p-8 transition-all hover:border-white/25"
      style={{
        backgroundColor: '#0a0a0a',
        // Amber rim — mog battles' official accent.
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(245,158,11,0.22)',
        touchAction: 'manipulation',
      }}
    >
      {/* Off-frame amber radial — yellow-gold glow from the bottom-left. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-[26rem] w-[26rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(245,158,11,0.95) 0%, rgba(234,179,8,0.45) 35%, transparent 65%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-2xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 35%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Swords size={44} aria-hidden className="text-white drop-shadow-lg" />
          <h2 className="text-5xl font-bold leading-none tracking-tight text-white">
            battles
          </h2>
          <p className="text-base text-white/85">
            live face-offs <span className="text-white/50">·</span> 1v1 or up to 10
          </p>
        </div>
        <ArrowRight
          size={22}
          aria-hidden
          className="text-white/80 transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}
