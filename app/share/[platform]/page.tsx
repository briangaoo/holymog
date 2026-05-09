'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, ExternalLink } from 'lucide-react';

/**
 * Interstitial page that confirms the share image landed on the user's
 * clipboard before redirecting to the platform's compose / upload page.
 * Owned-origin guarantee: by the time the new tab opens, focus is here,
 * so the user sees the confirmation before any cross-origin navigation.
 *
 * Inputs:
 *   /share/[platform]      — slug, used for label + theming + fallback URL
 *   ?to=<encoded url>      — actual destination (1s redirect target)
 */

const REDIRECT_MS = 2000;

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  snapchat: 'Snapchat',
  discord: 'Discord',
  reddit: 'Reddit',
  whatsapp: 'WhatsApp',
  imessage: 'iMessage',
  x: 'X',
};

const PLATFORM_FALLBACK_URL: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/upload',
  instagram: 'https://www.instagram.com/',
  snapchat: 'https://web.snapchat.com/',
  discord: 'https://discord.com/channels/@me',
  reddit: 'https://www.reddit.com/submit',
  whatsapp: 'https://wa.me/',
};

// Single dominant accent per platform — used for the radial wash + the
// rim glow on the card. Kept punchy because the page is brief; subtle
// here would feel undercooked.
const PLATFORM_ACCENT: Record<string, string> = {
  tiktok: '#EE1D52',
  instagram: '#dd2a7b',
  snapchat: '#fffc00',
  discord: '#5865F2',
  reddit: '#FF4500',
  whatsapp: '#25D366',
};

export default function SharePlatformPage() {
  const params = useParams<{ platform: string }>();
  const search = useSearchParams();
  const slug = (params?.platform ?? '').toLowerCase();
  const label = PLATFORM_LABELS[slug] ?? capitalize(slug);

  const toRaw = search.get('to') ?? '';
  const dest = isHttpUrl(toRaw)
    ? toRaw
    : PLATFORM_FALLBACK_URL[slug] ?? 'https://www.google.com/';

  const accent = PLATFORM_ACCENT[slug] ?? '#a855f7';

  // Trigger the redirect once on mount.
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.href = dest;
    }, REDIRECT_MS);
    return () => window.clearTimeout(t);
  }, [dest]);

  // Cache-buster matches what ShareSheet uses so the same logo PNG hits.
  const logoSrc = `/icons/${slug}.png?v=2`;
  const [hasLogo, setHasLogo] = useState(false);
  useEffect(() => {
    const probe = new window.Image();
    probe.onload = () => setHasLogo(true);
    probe.onerror = () => setHasLogo(false);
    probe.src = logoSrc;
  }, [logoSrc]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
      {/* Big diffused spotlight in the platform's brand colour, top-anchored
          so the upper third of the page glows. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent}55 0%, ${accent}22 35%, transparent 65%)` }}
      />
      {/* Subtle frosted glass overlay so the spotlight reads as light
          BEHIND a surface, matching the home cards' look. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-3xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
      />

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex w-full max-w-md flex-col items-center gap-7 text-center"
      >
        {/* Animated tick — pulsing emerald ring around the check so the
            confirmation reads as alive, not static. */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <motion.span
            aria-hidden
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full"
            style={{ border: '2px solid rgba(16,185,129,0.6)' }}
          />
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.5,
              ease: [0.34, 1.56, 0.64, 1],
              delay: 0.05,
            }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20"
            style={{
              boxShadow:
                '0 0 0 1px rgba(16,185,129,0.5), 0 0 50px rgba(16,185,129,0.45)',
            }}
          >
            <Check size={40} className="text-emerald-300" strokeWidth={3} />
          </motion.div>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-bold leading-none tracking-tight">
            image copied
          </h1>
          <div className="flex items-center justify-center gap-2.5 text-base text-white/65">
            <span>paste it into</span>
            {hasLogo ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] py-1.5 pl-1.5 pr-3.5 backdrop-blur">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  alt={label}
                  className="h-6 w-6 rounded-md object-contain"
                />
                <span className="text-sm font-semibold text-white">
                  {label}
                </span>
              </span>
            ) : (
              <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-sm font-semibold text-white">
                {label}
              </span>
            )}
          </div>
        </div>

        {/* 1-second linear countdown bar. Width animates 0 → 100% over
            REDIRECT_MS so it visually fills as the timer counts down. */}
        <div className="mt-2 flex w-full max-w-[260px] flex-col items-center gap-2">
          <div
            className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]"
            aria-hidden
          >
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: REDIRECT_MS / 1000, ease: 'linear' }}
              className="h-full rounded-full"
              style={{
                backgroundColor: accent,
                boxShadow: `0 0 14px ${accent}88`,
              }}
            />
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            opening {label}…
          </p>
        </div>

        <a
          href={dest}
          className="inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/80"
        >
          go now <ExternalLink size={11} aria-hidden />
        </a>
      </motion.div>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isHttpUrl(s: string): boolean {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
