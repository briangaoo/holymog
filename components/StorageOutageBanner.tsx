'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const DISMISS_KEY = 'holymog-storage-outage-dismissed';

/**
 * Full-width red urgent banner pinned above every page (including
 * AppHeader / wordmark) while Supabase Storage is wedged for project
 * onnxwfkngqsoluevnanp. Dismissable per-session via sessionStorage so
 * a tester who acknowledges it doesn't keep seeing it on every nav,
 * but a fresh tab / new visitor sees it again — the issue is real and
 * shouldn't be silently swept until Storage is actually fixed.
 *
 * Remove this component once Supabase restores Storage:
 *   1. Delete this file
 *   2. Drop the <StorageOutageBanner /> render from components/Providers.tsx
 *   3. (Optional) clear the sessionStorage key for any tester who'd
 *      otherwise see the banner re-appear briefly on next page load —
 *      `sessionStorage.removeItem('holymog-storage-outage-dismissed')`
 */
export function StorageOutageBanner() {
  // Start hidden during hydration to avoid a flash; the useEffect then
  // restores from sessionStorage. SSR also renders nothing so the
  // server/client markup matches.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // sessionStorage blocked (private mode / no-cookies) → show the
      // banner anyway. Failing safe = users get the warning.
    }
    setHidden(dismissed);
  }, []);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore — UI still hides regardless of persistence
    }
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="relative z-[60] flex w-full items-center gap-3 bg-red-600 px-4 pb-2.5 text-white shadow-[0_2px_12px_rgba(220,38,38,0.45)]"
      style={{
        // iPhone notch / Dynamic Island clearance; falls back to 10px
        // on desktop / Android.
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
      }}
    >
      <AlertTriangle
        size={16}
        aria-hidden
        strokeWidth={2.5}
        className="shrink-0"
      />
      <span aria-hidden className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </span>
      <span className="flex-1 text-[11px] font-bold uppercase leading-snug tracking-[0.16em] sm:text-xs">
        IMAGE PREVIEWS TEMPORARILY UNAVAILABLE · STORAGE OUTAGE · SCANS + BATTLES STILL WORK
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="dismiss"
        className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-white/90 transition-opacity hover:opacity-70"
      >
        <X size={16} aria-hidden strokeWidth={2.5} />
      </button>
    </div>
  );
}
