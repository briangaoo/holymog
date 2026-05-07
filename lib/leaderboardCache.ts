import type { LeaderboardRow } from './supabase';

const STORAGE_KEY = 'holymog-leaderboard-cache-v1';
const TTL_MS = 5 * 60 * 1000; // 5 minutes

type Cached = {
  entries: LeaderboardRow[];
  hasMore: boolean;
  fetchedAt: number;
};

export function readLeaderboardCache(): Cached | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Cached>;
    if (
      !parsed ||
      !Array.isArray(parsed.entries) ||
      typeof parsed.fetchedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return {
      entries: parsed.entries,
      hasMore: !!parsed.hasMore,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

export function writeLeaderboardCache(entries: LeaderboardRow[], hasMore: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const payload: Cached = { entries, hasMore, fetchedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLeaderboardCache() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Best-effort prefetch of page 1; safe to call multiple times. */
export async function prefetchLeaderboard(): Promise<void> {
  try {
    const res = await fetch('/api/leaderboard?page=1', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      entries?: LeaderboardRow[];
      hasMore?: boolean;
      error?: string;
    };
    if (data.error || !data.entries) return;
    writeLeaderboardCache(data.entries, !!data.hasMore);
  } catch {
    // ignore
  }
}
