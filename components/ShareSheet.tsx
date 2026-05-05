'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Copy, Link as LinkIcon, Share2, X } from 'lucide-react';
import { useShare } from '@/hooks/useShare';

type Props = {
  open: boolean;
  onClose: () => void;
  score: number;
};

type PlatformButton = {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  icon: React.ReactNode;
  bg?: string;
};

function IconBg({
  src,
  alt,
  bg,
}: {
  src: string;
  alt: string;
  bg: string;
}) {
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-2xl"
      style={{ background: bg }}
    >
      <Image src={src} alt={alt} width={28} height={28} />
    </div>
  );
}

export function ShareSheet({ open, onClose, score }: Props) {
  const {
    canNativeShare,
    nativeShare,
    shareToTwitter,
    copyImage,
    copyImageFor,
    copyLink,
    toast,
  } = useShare(score);

  const platforms: PlatformButton[] = [
    {
      label: 'TikTok',
      ariaLabel: 'Share to TikTok',
      onClick: () => copyImageFor('TikTok'),
      icon: <IconBg src="/icons/tiktok.svg" alt="TikTok" bg="#000000" />,
    },
    {
      label: 'Instagram',
      ariaLabel: 'Share to Instagram',
      onClick: () => copyImageFor('Instagram'),
      icon: (
        <IconBg
          src="/icons/instagram.svg"
          alt="Instagram"
          bg="linear-gradient(135deg,#f58529,#dd2a7b 50%,#8134af)"
        />
      ),
    },
    {
      label: 'Snapchat',
      ariaLabel: 'Share to Snapchat',
      onClick: () => copyImageFor('Snapchat'),
      icon: <IconBg src="/icons/snapchat.svg" alt="Snapchat" bg="#fffc00" />,
    },
    {
      label: 'X',
      ariaLabel: 'Share to X / Twitter',
      onClick: shareToTwitter,
      icon: <IconBg src="/icons/x.svg" alt="X" bg="#000000" />,
    },
    {
      label: 'Discord',
      ariaLabel: 'Share to Discord',
      onClick: () => copyImageFor('Discord'),
      icon: <IconBg src="/icons/discord.svg" alt="Discord" bg="#5865F2" />,
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
            className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-black p-5 sm:rounded-3xl"
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
                className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
              >
                <Share2 size={16} aria-hidden />
                Share
              </button>
            )}

            <div className="grid grid-cols-4 gap-3">
              {platforms.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={p.onClick}
                  aria-label={p.ariaLabel}
                  style={{ touchAction: 'manipulation' }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl py-2 transition-colors hover:bg-white/5 active:bg-white/10"
                >
                  {p.icon}
                  <span className="text-[11px] text-zinc-400">{p.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => copyImage()}
                aria-label="Copy share image"
                style={{ touchAction: 'manipulation' }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
              >
                <Copy size={14} aria-hidden /> Copy Image
              </button>
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link"
                style={{ touchAction: 'manipulation' }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
              >
                <LinkIcon size={14} aria-hidden /> Copy Link
              </button>
            </div>

            <AnimatePresence>
              {toast && (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  aria-live="polite"
                  className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center text-xs text-white"
                >
                  {toast.message}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
