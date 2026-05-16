'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateShareImage } from '@/lib/shareImageGenerator';
import { getTier } from '@/lib/tier';
import type { FinalScores } from '@/types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://holymog.com';

function getShareText(tier: string, url: string): string {
  if (['F-', 'F', 'F+', 'D-', 'D', 'D+'].includes(tier))
    return `I got ${tier} on holymog 💀 mog or get mogged: ${url}`;
  if (['C-', 'C', 'C+'].includes(tier))
    return `I got ${tier} on holymog. mid. ${url}`;
  if (['B-', 'B', 'B+', 'A-', 'A', 'A+'].includes(tier))
    return `I got ${tier} on holymog 🔥 ${url}`;
  return `I got ${tier} on holymog. genetically mogging y'all 👑 ${url}`;
}

type Toast = { id: number; message: string };

export function useShare(scores: FinalScores, capturedImage?: string) {
  const [toast, setToast] = useState<Toast | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const blobPromiseRef = useRef<Promise<Blob> | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  // Object URL of the generated share image, exposed so consumers can
  // render a live <img> preview inside the share sheet. Object URLs
  // are revoked on unmount so we don't leak.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setCanNativeShare(typeof navigator.share === 'function' && typeof navigator.canShare === 'function');
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      blobPromiseRef.current = generateShareImage({
        scores,
        capturedImage,
      }).then((b) => {
        blobRef.current = b;
        // Expose a preview URL so the share sheet can render the
        // exact image the user is about to post.
        setPreviewUrl((curr) => {
          if (curr) URL.revokeObjectURL(curr);
          return URL.createObjectURL(b);
        });
        return b;
      });
    }
    return blobPromiseRef.current;
  }, [scores, capturedImage]);

  const tier = getTier(scores.overall).letter;
  const shareText = getShareText(tier, APP_URL);
  // URL-bound copy: strip emojis. WhatsApp Web and a few other targets
  // mojibake them into � when round-tripping through their intent URLs.
  // Native share and clipboard both handle UTF-8 cleanly, so the rich
  // version stays in `shareText`.
  const urlShareText = shareText
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const nativeShare = useCallback(async () => {
    try {
      const blob = await ensureBlob();
      const file = new File([blob], `holymog-${tier}.png`, { type: 'image/png' });
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
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(urlShareText)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  }, [urlShareText]);

  // iMessage / SMS — uses the sms: protocol with body= preset. Native on
  // iOS opens Messages; on macOS opens Messages.app; on Android most
  // browsers honour it too.
  const shareToiMessage = useCallback(() => {
    const url = `sms:&body=${encodeURIComponent(urlShareText)}`;
    window.location.href = url;
  }, [urlShareText]);

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
    (platform: string) => copyImage(`Image copied, paste in ${platform}`),
    [copyImage],
  );

  /**
   * For copy-and-redirect platforms, we open our own /share/[platform]
   * interstitial route in a new tab. That page shows a giant "image
   * copied" confirmation, then redirects to the destination 1s later.
   * The new tab being on our own origin means the user definitely sees
   * the confirmation before any cross-origin navigation pulls focus.
   *
   * Adding `?to=<encoded url>` lets us reuse one interstitial across
   * every platform; the route falls back to a hardcoded URL per slug
   * if `to` is missing or malformed.
   */
  const openInterstitial = useCallback((slug: string, dest: string) => {
    const url = `/share/${slug}?to=${encodeURIComponent(dest)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Reddit submit URL — opens the new-post composer pre-filled with the
  // title + URL. Reddit doesn't accept image attachments via web intent,
  // so we pre-copy the image to the clipboard.
  const shareToReddit = useCallback(async () => {
    void copyImageFor('Reddit');
    const url = `https://www.reddit.com/submit?title=${encodeURIComponent(
      `I got ${tier} on holymog`,
    )}&url=${encodeURIComponent(APP_URL)}`;
    openInterstitial('reddit', url);
  }, [copyImageFor, tier, openInterstitial]);

  // WhatsApp universal share link. wa.me works on every platform and
  // both apps + web.
  const shareToWhatsApp = useCallback(async () => {
    void copyImageFor('WhatsApp');
    openInterstitial(
      'whatsapp',
      `https://wa.me/?text=${encodeURIComponent(urlShareText)}`,
    );
  }, [copyImageFor, urlShareText, openInterstitial]);

  // ---- Copy-only platforms with no public web intent ---------------------
  // Each copies the image to the clipboard AND opens our /share/<key>
  // interstitial which displays "image copied, paste in X" before
  // redirecting to the platform's compose / upload landing page.

  const shareToTikTok = useCallback(async () => {
    void copyImageFor('TikTok');
    openInterstitial('tiktok', 'https://www.tiktok.com/upload');
  }, [copyImageFor, openInterstitial]);

  const shareToInstagram = useCallback(async () => {
    void copyImageFor('Instagram');
    openInterstitial('instagram', 'https://www.instagram.com/');
  }, [copyImageFor, openInterstitial]);

  const shareToSnapchat = useCallback(async () => {
    void copyImageFor('Snapchat');
    openInterstitial('snapchat', 'https://web.snapchat.com/');
  }, [copyImageFor, openInterstitial]);

  const shareToDiscord = useCallback(async () => {
    void copyImageFor('Discord');
    openInterstitial('discord', 'https://discord.com/channels/@me');
  }, [copyImageFor, openInterstitial]);

  return {
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
    copyImageFor,
    copyLink,
    toast,
    shareText,
    appUrl: APP_URL,
    previewUrl,
    ensureBlob,
  };
}
