'use client';

import { useCallback, useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

/**
 * Exit-impersonation button rendered inside the (server-side)
 * ImpersonationBanner. Posts to /api/admin/impersonate/stop and
 * does a full reload so the layout re-runs without the cookie
 * and the banner disappears.
 *
 * Lives in its own client file because the parent banner is a
 * server component (reads cookies, queries DB for the target's
 * display_name) — Next won't let server components contain
 * onClick handlers directly.
 */
export function ImpersonationExitButton() {
  const [pending, setPending] = useState(false);
  const onExit = useCallback(async () => {
    setPending(true);
    try {
      await fetch('/api/admin/impersonate/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
    } catch {
      // ignore — reload below either way; the cookie may or may
      // not have been cleared but reloading at minimum restores the
      // banner-or-no-banner truth.
    }
    // Full reload (not router.refresh) so every server component
    // including the layout re-evaluates the cookie. router.refresh
    // alone wouldn't drop the banner in some cached scenarios.
    if (typeof window !== 'undefined') {
      window.location.assign('/admin');
    }
  }, []);
  return (
    <button
      type="button"
      onClick={onExit}
      disabled={pending}
      className="flex flex-shrink-0 items-center gap-1.5 border-2 border-white bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-white/90 disabled:opacity-40"
      style={{ borderRadius: 2 }}
    >
      {pending ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <LogOut size={11} />
      )}
      EXIT
    </button>
  );
}
