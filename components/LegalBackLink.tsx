'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readBackNav, clearBackNav } from '@/lib/back-nav';

/**
 * Smart "back" link rendered at the top of /terms and /privacy. Reads
 * the back-nav breadcrumb dropped by whoever clicked through to this
 * page — typically a modal that wants the user returned to their
 * original popup with state intact — and routes back there. Falls
 * back to "/" when there's no breadcrumb (direct nav, social link).
 *
 * The label updates per destination: "back to scan", "back to
 * leaderboard", "back home". Stays lowercase so it matches the rest
 * of the site's typography.
 */
export function LegalBackLink() {
  const router = useRouter();
  const [label, setLabel] = useState<string>('home');
  const [targetUrl, setTargetUrl] = useState<string>('/');

  useEffect(() => {
    const snap = readBackNav();
    if (snap) {
      setLabel(snap.label || 'home');
      setTargetUrl(snap.url || '/');
    }
  }, []);

  // "back home" reads cleaner than "back to home" — only use the
  // "back to <x>" form when the destination is somewhere other than
  // the homepage. Brand stays lowercase.
  const labelText = label === 'home' ? 'back home' : `back to ${label}`;

  return (
    <button
      type="button"
      onClick={() => {
        // Source page reads the breadcrumb on mount to restore modal
        // state, so we keep it in place during the push and only
        // clear if there's nothing to restore. This is intentionally
        // best-effort: the source page can also call clearBackNav.
        router.push(targetUrl);
        // If there's no modal to restore, drop the breadcrumb so the
        // next inbound user doesn't get a stale destination label.
        const snap = readBackNav();
        if (!snap?.modal) clearBackNav();
      }}
      className="mb-8 inline-flex items-center gap-1.5 text-xs lowercase text-white/45 transition-colors hover:text-white/80"
    >
      <ArrowLeft size={12} aria-hidden /> {labelText}
    </button>
  );
}
