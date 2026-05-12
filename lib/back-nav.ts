'use client';

/**
 * Back-nav memory for the /terms and /privacy pages.
 *
 * When a user clicks a Link to /terms or /privacy from anywhere inside
 * the app, we drop a breadcrumb here recording (a) where to send them
 * when they hit "back" and (b) any modal state we should re-open with
 * — so checking a consent box, clicking "terms", and hitting back
 * lands them on the source page with the popup re-opened and the box
 * still checked.
 *
 * sessionStorage so it scoped to the tab and dies on tab close.
 */

export type BackModalRestore = {
  /** Stable identifier matched by the source page's restore hook. */
  id: 'privacy' | 'auth' | 'leaderboard' | 'battle';
  /** Free-form snapshot. Shape is owned by each modal — kept loose so
   *  this module stays modal-agnostic. */
  state?: Record<string, unknown>;
};

export type BackNavSnapshot = {
  url: string;
  /** Human label used by the back link, e.g. "scan", "leaderboard",
   *  "settings". Already lowercase so the lowercase-everywhere brand
   *  stays consistent. */
  label: string;
  /** Modal state to restore on return. Optional. */
  modal?: BackModalRestore;
};

const KEY = 'holymog:back-nav';

export function saveBackNav(snapshot: BackNavSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // private mode / quota — best-effort
  }
}

export function readBackNav(): BackNavSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackNavSnapshot;
    if (typeof parsed?.url !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBackNav(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Read AND clear in one shot. Source pages that re-open modals call
 *  this on mount so the breadcrumb is consumed exactly once. The
 *  whole breadcrumb is dropped — once the user is back where they
 *  came from, holding on to the URL/label only invites stale "back
 *  to <somewhere>" labels on later /terms or /privacy visits that
 *  weren't preceded by a captureCurrentAsBack call. */
export function consumeModalRestore(
  id: BackModalRestore['id'],
): Record<string, unknown> | null {
  const snap = readBackNav();
  if (!snap?.modal || snap.modal.id !== id) return null;
  clearBackNav();
  return snap.modal.state ?? {};
}

/** Derive a friendly lowercase label from a URL path. */
export function labelForPath(pathname: string): string {
  const cleaned = pathname.split('?')[0].split('#')[0];
  if (cleaned === '/' || cleaned === '') return 'home';
  if (cleaned.startsWith('/@')) return 'profile';
  const segment = cleaned.split('/').filter(Boolean)[0];
  if (!segment) return 'home';
  // /mog/battle → "mog"; /account → "account"
  return segment;
}

/** Capture the current page as the back target. Call this from a
 *  Link's onClick right before nav. */
export function captureCurrentAsBack(modal?: BackModalRestore): void {
  if (typeof window === 'undefined') return;
  const url = window.location.pathname + window.location.search;
  const label = labelForPath(window.location.pathname);
  saveBackNav({ url, label, modal });
}
