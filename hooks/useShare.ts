'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateShareImage } from '@/lib/shareImageGenerator';
import { getTier } from '@/lib/tier';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mogem.vercel.app';

function getShareText(tier: string, url: string): string {
  if (['F-', 'F', 'F+', 'D-', 'D', 'D+'].includes(tier))
    return `I got ${tier} on Mogem 💀 mog or get mogged: ${url}`;
  if (['C-', 'C', 'C+'].includes(tier))
    return `I got ${tier} on Mogem. mid. ${url}`;
  if (['B-', 'B', 'B+', 'A-', 'A', 'A+'].includes(tier))
    return `I got ${tier} on Mogem 🔥 ${url}`;
  return `I got ${tier} on Mogem. genetically mogging y'all 👑 ${url}`;
}

type Toast = { id: number; message: string };

export function useShare(score: number) {
  const [toast, setToast] = useState<Toast | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const blobPromiseRef = useRef<Promise<Blob> | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setCanNativeShare(typeof navigator.share === 'function' && typeof navigator.canShare === 'function');
  }, []);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    window.setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, 2200);
  }, []);

  const ensureBlob = useCallback(async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current;
    if (!blobPromiseRef.current) {
      blobPromiseRef.current = generateShareImage(score).then((b) => {
        blobRef.current = b;
        return b;
      });
    }
    return blobPromiseRef.current;
  }, [score]);

  const tier = getTier(score).letter;
  const shareText = getShareText(tier, APP_URL);

  const nativeShare = useCallback(async () => {
    try {
      const blob = await ensureBlob();
      const file = new File([blob], `mogem-${tier}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText, url: APP_URL });
        return;
      }
      await navigator.share({ text: shareText, url: APP_URL });
    } catch {
      // user cancelled or unsupported
    }
  }, [ensureBlob, shareText, tier]);

  const shareToTwitter = useCallback(() => {
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  }, [shareText]);

  const copyImage = useCallback(async (label = 'Image copied') => {
    try {
      const blob = await ensureBlob();
      if (typeof ClipboardItem === 'undefined') {
        showToast('Copy not supported on this device');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast(label);
    } catch {
      showToast('Could not copy image');
    }
  }, [ensureBlob, showToast]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      showToast('Link copied');
    } catch {
      showToast('Could not copy link');
    }
  }, [showToast]);

  const copyImageFor = useCallback(
    (platform: string) => copyImage(`Image copied — paste in ${platform}`),
    [copyImage],
  );

  return {
    canNativeShare,
    nativeShare,
    shareToTwitter,
    copyImage,
    copyImageFor,
    copyLink,
    toast,
    shareText,
    appUrl: APP_URL,
  };
}
