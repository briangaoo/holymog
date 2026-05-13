'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link as LinkIcon, Share2, X } from 'lucide-react';
import { useShare } from '@/hooks/useShare';
import type { FinalScores } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  scores: FinalScores;
  /** dataURL of the captured frame. Threaded to the canvas generator
   *  so the share image shows the same avatar circle that's on-screen.
   *  Optional — generator skips the avatar cleanly when absent. */
  capturedImage?: string;
};

type Platform = {
  /** Stable id used for the icon filename (`/icons/{key}.svg`) and React key. */
  key: string;
  label: string;
  ariaLabel: string;
  /** Brand background colour (or CSS gradient) used for the icon tile. */
  bg: string;
  /** Letter shown in the placeholder tile until a logo SVG is dropped in. */
  initial: string;
  /** Letter colour. Defaults to white; override for light backgrounds. */
  initialColor?: string;
  /**
   * Tight crop on the rendered logo. When the source PNG has padding baked
   * in (e.g. X has a thin transparent border that makes it look smaller
   * than its neighbours), set zoom > 1 to scale the image up. The host
   * tile clips overflow so neighbouring tiles aren't displaced.
   */
  zoom?: number;
  onClick: () => void;
};

/**
 * Icon tile that shows the platform's logo when `/icons/{key}.png` exists,
 * otherwise renders a clean letter-on-brand-colour placeholder so the share
 * sheet looks complete before assets are dropped in.
 */
function PlatformTile({ p }: { p: Platform }) {
  const [hasLogo, setHasLogo] = useState(false);
  // Try to load the SVG once on mount. Using a hidden Image preflight is
  // simpler than a HEAD fetch and works around Next/Image's caching.
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setHasLogo(true);
    img.onerror = () => setHasLogo(false);
    img.src = `/icons/${p.key}.png?v=2`;
  }, [p.key]);

  // Logo present → render the raw PNG (each asset already has its own
  // brand colour / shape baked in). Logo missing → fall back to a
  // letter-on-brand-colour placeholder so the sheet still looks intact.
  if (hasLogo) {
    // Plain <img> rather than next/image — these are ~44px brand icons,
    // optimization is unnecessary, and Next 16 rejects query strings on
    // <Image src> without an explicit images.localPatterns allowlist.
    // The ?v=N suffix is our cache-buster: bump it whenever you swap a
    // logo PNG so the browser fetches the new bytes instead of serving
    // a stale optimized variant.
    //
    // Wrapper has overflow-hidden + rounded-sm so a per-platform `zoom`
    // (e.g. X has a transparent border baked into its PNG) scales the
    // image up without pushing neighbouring tiles around.
    return (
      <div className="relative h-11 w-11 overflow-hidden rounded-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/icons/${p.key}.png?v=2`}
          alt={p.label}
          width={44}
          height={44}
          className="h-full w-full object-contain"
          style={p.zoom && p.zoom !== 1 ? { transform: `scale(${p.zoom})` } : undefined}
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-sm"
      style={{ background: p.bg }}
    >
      <span
        aria-hidden
        className="text-lg font-extrabold uppercase"
        style={{ color: p.initialColor ?? '#ffffff' }}
      >
        {p.initial}
      </span>
    </div>
  );
}

export function ShareSheet({ open, onClose, scores, capturedImage }: Props) {
  const {
    canNativeShare,
    nativeShare,
    shareToTwitter,
    shareToReddit,
    shareToWhatsApp,
    shareToiMessage,
    shareToTikTok,
    shareToInstagram,
    shareToSnapchat,
    shareToDiscord,
    copyImage,
    copyLink,
    toast,
  } = useShare(scores, capturedImage);

  // Order: visual social → public posting → closed-circle. 9 platforms,
  // 3×3 grid. Brand colours match official guidelines so the sheet still
  // reads correctly even before logo SVGs are in place.
  const platforms: Platform[] = [
    {
      key: 'tiktok',
      label: 'TikTok',
      ariaLabel: 'Share to TikTok',
      bg: '#000000',
      initial: 'T',
      onClick: () => void shareToTikTok(),
    },
    {
      key: 'instagram',
      label: 'Instagram',
      ariaLabel: 'Share to Instagram',
      bg: 'linear-gradient(135deg,#f58529,#dd2a7b 50%,#8134af)',
      initial: 'I',
      onClick: () => void shareToInstagram(),
    },
    {
      key: 'snapchat',
      label: 'Snapchat',
      ariaLabel: 'Share to Snapchat',
      bg: '#fffc00',
      initial: 'S',
      initialColor: '#000000',
      onClick: () => void shareToSnapchat(),
    },
    {
      key: 'x',
      label: 'X',
      ariaLabel: 'Share to X / Twitter',
      bg: '#000000',
      initial: 'X',
      // The X PNG has a thin transparent border baked in — scale a touch
      // so it sits at the same visual size as the neighbours.
      zoom: 1.12,
      onClick: shareToTwitter,
    },
    {
      key: 'imessage',
      label: 'iMessage',
      ariaLabel: 'Share via iMessage / SMS',
      bg: '#34C759',
      initial: 'M',
      onClick: shareToiMessage,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      ariaLabel: 'Share to WhatsApp',
      bg: '#25D366',
      initial: 'W',
      onClick: () => void shareToWhatsApp(),
    },
    {
      key: 'discord',
      label: 'Discord',
      ariaLabel: 'Share to Discord',
      bg: '#5865F2',
      initial: 'D',
      onClick: () => void shareToDiscord(),
    },
    {
      key: 'reddit',
      label: 'Reddit',
      ariaLabel: 'Share to Reddit',
      bg: '#FF4500',
      initial: 'R',
      onClick: () => void shareToReddit(),
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Share your tier"
          onClick={onClose}
        >
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-black p-5 sm:rounded-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Share your tier</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close share sheet"
                style={{ touchAction: 'manipulation' }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                aria-label="Share via system share sheet"
                style={{ touchAction: 'manipulation' }}
                className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
              >
                <Share2 size={16} aria-hidden />
                Share
              </button>
            )}

            <div className="grid grid-cols-4 gap-2">
              {platforms.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={p.onClick}
                  aria-label={p.ariaLabel}
                  style={{ touchAction: 'manipulation' }}
                  className="flex flex-col items-center gap-1.5 rounded-sm pt-4 pb-2 transition-colors hover:bg-white/5 active:bg-white/10"
                >
                  <PlatformTile p={p} />
                  <span className="text-[11px] normal-case text-zinc-400">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => copyImage()}
                aria-label="Copy share image"
                style={{ touchAction: 'manipulation' }}
                className="flex items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
              >
                <Copy size={14} aria-hidden /> Copy Image
              </button>
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link"
                style={{ touchAction: 'manipulation' }}
                className="flex items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
              >
                <LinkIcon size={14} aria-hidden /> Copy Link
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
      <ToastPortal toast={toast} />
    </AnimatePresence>
  );
}

/**
 * Portal-mounted top-of-viewport toast. Lives outside the share-sheet
 * modal so it's visible during the 1-second delay before a copy-and-open
 * platform navigates to its destination — the user actually sees that the
 * image landed on the clipboard before focus shifts to the new tab.
 */
function ToastPortal({
  toast,
}: {
  toast: { id: number; message: string } | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-5 py-3 text-sm font-medium text-white shadow-[0_8px_30px_rgba(255,255,255,0.20)] backdrop-blur"
          style={{ top: 'max(env(safe-area-inset-top), 24px)' }}
        >
          <Check size={16} className="text-white" aria-hidden />
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
