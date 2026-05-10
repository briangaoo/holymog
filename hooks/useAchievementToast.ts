'use client';

import { useEffect, useState } from 'react';

export type AchievementGrant = {
  achievement_key: string;
  slug: string;
  name: string;
};

/**
 * Module-level toast queue. Achievement grants land here on success
 * responses from /api/score, /api/battle/finish, /api/account/me PATCH,
 * and /api/battle/queue. The AchievementToastContainer subscribes to
 * this queue and renders one toast per pending grant.
 *
 * Singleton-of-one (not React state) so push calls from anywhere in
 * the app reach every subscriber without prop drilling or a context.
 */

let queue: AchievementGrant[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // best-effort
    }
  }
}

/** Append grants to the toast queue. Idempotent on identical
 *  achievement_key collisions within a single second (a backend bug
 *  shouldn't shower the user with duplicate toasts). */
export function pushAchievements(grants: AchievementGrant[] | undefined): void {
  if (!grants || grants.length === 0) return;
  const dedupe = new Set(queue.map((g) => g.achievement_key));
  const fresh = grants.filter((g) => !dedupe.has(g.achievement_key));
  if (fresh.length === 0) return;
  queue = [...queue, ...fresh];
  notify();
}

/**
 * Hook returns the current queue + a dismiss function. The container
 * component renders one toast per queue entry with auto-dismiss
 * timing handled by the container.
 */
export function useAchievementToast(): {
  queue: AchievementGrant[];
  dismiss: (key: string) => void;
} {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const dismiss = (key: string) => {
    queue = queue.filter((g) => g.achievement_key !== key);
    notify();
  };
  return { queue, dismiss };
}
