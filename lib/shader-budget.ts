/**
 * Module-level shader-instance budget. Inline shader frames in lists
 * (leaderboard, follower list, battle tiles) compete for a small pool
 * of WebGL contexts so a long list doesn't crash mobile Safari.
 *
 * Fullscreen shaders (themes on a single profile page) bypass this —
 * they're solo and high priority. Only inline shaders contend for
 * slots; over the cap, surplus shaders render their reduced-motion
 * fallback instead.
 */

const MAX_CONCURRENT = 8;

let active = 0;
const listeners = new Set<() => void>();

/**
 * Try to acquire a slot. Returns true if granted, false if the cap
 * is at capacity. Callers MUST pair with `releaseShaderSlot()` on
 * unmount or out-of-viewport.
 */
export function acquireShaderSlot(): boolean {
  if (active >= MAX_CONCURRENT) return false;
  active++;
  notify();
  return true;
}

export function releaseShaderSlot(): void {
  if (active > 0) {
    active--;
    notify();
  }
}

export function getShaderBudget(): { active: number; max: number } {
  return { active, max: MAX_CONCURRENT };
}

/**
 * Subscribe to budget-changed notifications. Lets components waiting
 * for a slot retry on every release (so when one shader scrolls
 * off-screen, the next one in queue picks up its slot).
 */
export function onShaderBudgetChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // best-effort
    }
  }
}
