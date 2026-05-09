/**
 * Reconnection state for an in-flight battle.
 *
 * Persisted to localStorage when a user enters a battle (lobby or
 * active) so that an accidental tab-close + reopen of /mog can drop
 * them back into the same battle if it's still running. Cleared on
 * `finished`, explicit leave, or when the stored entry ages past
 * RECONNECT_WINDOW_MS (any active battle phase is over by then).
 */
const STORAGE_KEY = 'holymog-active-battle';

// Battles run ≤13s (3s countdown + 10s active). Lobbies linger longer
// — give them up to 15 minutes before we treat the entry as stale.
const RECONNECT_WINDOW_MS = 15 * 60 * 1000;

export type ActiveBattleEntry = {
  battle_id: string;
  // For private battles we also persist the code so we can rejoin
  // straight into the lobby UI. Public 1v1 has no code.
  code?: string;
  isHost: boolean;
  // ISO timestamp written at the time the entry was saved.
  ts: number;
};

export function readActiveBattle(): ActiveBattleEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveBattleEntry>;
    if (
      typeof parsed.battle_id !== 'string' ||
      typeof parsed.isHost !== 'boolean' ||
      typeof parsed.ts !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > RECONNECT_WINDOW_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      battle_id: parsed.battle_id,
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      isHost: parsed.isHost,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function writeActiveBattle(entry: Omit<ActiveBattleEntry, 'ts'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...entry, ts: Date.now() }),
    );
  } catch {
    // Storage unavailable (private mode, etc.) — silently ignore.
  }
}

export function clearActiveBattle() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
