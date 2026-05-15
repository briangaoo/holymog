'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

/**
 * Staff console UI. Server gates the page at /admin via requireAdmin(),
 * so by the time this client renders we know the caller is an admin.
 * Every action still re-checks on the server — never trust the gate
 * here alone.
 *
 * Layout (single column, max-w-3xl):
 *   - Lookup bar: paste a @username / email / user_id, get a dossier.
 *   - User dossier card: ban-state banner + identity + counters +
 *     scans list (with per-row DELETE) + leaderboard row (with REMOVE)
 *     + per-user audit history.
 *   - Recent global audit feed at the bottom: last 100 events across
 *     the platform for anomaly spotting.
 */

type LookupResponse =
  | { kind: 'not_found' }
  | {
      kind: 'found';
      user: AdminUser;
      leaderboard: AdminLeaderboard | null;
      scans: AdminScan[];
      audit: AdminAuditEntry[];
    };

type AdminUser = {
  user_id: string;
  display_name: string;
  email: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  best_scan_overall: number | null;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  subscription_status: string | null;
  created_at: string;
  updated_at: string | null;
  active_sessions: number;
};

type AdminLeaderboard = {
  id: string;
  overall: number;
  image_url: string | null;
  created_at: string;
};

type AdminScan = {
  id: string;
  overall: number;
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
  created_at: string;
};

type AdminAuditEntry = {
  id: string;
  user_id?: string | null;
  action: string;
  resource: string | null;
  metadata: unknown;
  created_at: string;
  ip_hash?: string | null;
};

export function AdminConsole({ adminUserId }: { adminUserId: string }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);

  const [banReason, setBanReason] = useState('');
  const [banPending, setBanPending] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  const [actionState, setActionState] = useState<
    Record<string, 'idle' | 'pending' | 'done' | 'error'>
  >({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const [globalAudit, setGlobalAudit] = useState<AdminAuditEntry[] | null>(null);
  const [globalAuditLoading, setGlobalAuditLoading] = useState(false);

  const refreshUser = useCallback(async (q: string) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/admin/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
        cache: 'no-store',
      });
      if (!res.ok) {
        setSearchError(`lookup failed (${res.status})`);
        setResult(null);
        return;
      }
      const data = (await res.json()) as LookupResponse;
      setResult(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'lookup failed');
      setResult(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      setBanReason('');
      setBanError(null);
      setActionState({});
      setActionError({});
      await refreshUser(trimmed);
    },
    [query, refreshUser],
  );

  const refreshGlobalAudit = useCallback(async () => {
    setGlobalAuditLoading(true);
    try {
      const res = await fetch('/api/admin/audit?limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) {
        setGlobalAudit(null);
        return;
      }
      const data = (await res.json()) as { entries: AdminAuditEntry[] };
      setGlobalAudit(data.entries);
    } catch {
      setGlobalAudit(null);
    } finally {
      setGlobalAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGlobalAudit();
  }, [refreshGlobalAudit]);

  const found = result?.kind === 'found' ? result : null;
  const user = found?.user ?? null;

  const setAction = (key: string, state: 'idle' | 'pending' | 'done' | 'error') =>
    setActionState((s) => ({ ...s, [key]: state }));
  const setError = (key: string, msg: string | null) =>
    setActionError((e) => {
      const next = { ...e };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });

  const onBan = useCallback(async () => {
    if (!user) return;
    const reason = banReason.trim();
    if (!reason) {
      setBanError('reason is required — it gets emailed to the user');
      return;
    }
    if (
      !window.confirm(
        `ban ${user.display_name} (${user.user_id})?\n\nthis ends all their sessions and emails them the reason. unban is one click but they will see the email.`,
      )
    ) {
      return;
    }
    setBanPending(true);
    setBanError(null);
    try {
      const res = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, reason }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBanError(body.error ?? `ban failed (${res.status})`);
        return;
      }
      await refreshUser(user.user_id);
      setBanReason('');
    } catch (err) {
      setBanError(err instanceof Error ? err.message : 'ban failed');
    } finally {
      setBanPending(false);
    }
  }, [user, banReason, refreshUser]);

  const onUnban = useCallback(async () => {
    if (!user) return;
    if (!window.confirm(`unban ${user.display_name}?`)) return;
    setAction('unban', 'pending');
    setError('unban', null);
    try {
      const res = await fetch('/api/admin/unban', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError('unban', body.error ?? `unban failed (${res.status})`);
        setAction('unban', 'error');
        return;
      }
      setAction('unban', 'done');
      await refreshUser(user.user_id);
    } catch (err) {
      setError('unban', err instanceof Error ? err.message : 'unban failed');
      setAction('unban', 'error');
    }
  }, [user, refreshUser]);

  const onDeleteLeaderboard = useCallback(async () => {
    if (!user) return;
    if (
      !window.confirm(
        `remove ${user.display_name} from the public leaderboard? (their scan_history + stats stay intact)`,
      )
    ) {
      return;
    }
    const key = 'lb';
    setAction(key, 'pending');
    setError(key, null);
    try {
      const res = await fetch('/api/admin/leaderboard-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(key, body.error ?? `failed (${res.status})`);
        setAction(key, 'error');
        return;
      }
      setAction(key, 'done');
      await refreshUser(user.user_id);
    } catch (err) {
      setError(key, err instanceof Error ? err.message : 'failed');
      setAction(key, 'error');
    }
  }, [user, refreshUser]);

  const onDeleteScan = useCallback(
    async (scanId: string) => {
      if (!user) return;
      if (
        !window.confirm(
          `delete scan ${scanId.slice(0, 8)}…? their best_scan_overall will recompute from what's left.`,
        )
      ) {
        return;
      }
      const key = `scan:${scanId}`;
      setAction(key, 'pending');
      setError(key, null);
      try {
        const res = await fetch('/api/admin/scan-delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scanId }),
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(key, body.error ?? `failed (${res.status})`);
          setAction(key, 'error');
          return;
        }
        setAction(key, 'done');
        await refreshUser(user.user_id);
      } catch (err) {
        setError(key, err instanceof Error ? err.message : 'failed');
        setAction(key, 'error');
      }
    },
    [user, refreshUser],
  );

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="border-b-2 border-white/15 bg-black">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center border-2 border-rose-500 bg-black"
              style={{ borderRadius: 2 }}
            >
              <ShieldCheck size={16} className="text-rose-400" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-400">
                STAFF — NO LINKS, NO INDEX
              </span>
              <h1 className="text-[14px] font-bold uppercase tracking-[0.12em] text-white">
                HOLYMOG ADMIN
              </h1>
            </div>
          </div>
          <span className="hidden text-[10px] uppercase tracking-[0.16em] text-white/40 sm:inline">
            OPERATOR {adminUserId.slice(0, 8)}…
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-6">
        {/* Lookup bar */}
        <section
          className="relative border-2 border-white/20 bg-black"
          style={{ borderRadius: 2 }}
        >
          <header className="flex items-center gap-3.5 px-5 pb-3 pt-5">
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-white/25 bg-white/[0.04]"
              style={{ borderRadius: 2 }}
            >
              <Search size={18} className="text-white" />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-bold uppercase leading-tight tracking-[0.12em] text-white">
                LOOKUP
              </span>
              <span className="text-[12px] leading-relaxed text-white/50">
                @username · email · user_id uuid. exact match.
              </span>
            </div>
          </header>
          <form
            onSubmit={onSearch}
            className="flex items-stretch gap-2 border-t border-white/15 px-5 py-4"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="@someone, email, or uuid"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 border-2 border-white/30 bg-black px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-white focus:outline-none"
              style={{ borderRadius: 2, textTransform: 'none' }}
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="border-2 border-white bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderRadius: 2 }}
            >
              {searching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                'SEARCH'
              )}
            </button>
          </form>
          {searchError && (
            <div className="border-t border-rose-500/40 bg-rose-500/[0.04] px-5 py-3 text-[12px] text-rose-300">
              <AlertTriangle size={12} className="mr-1 inline" aria-hidden /> {searchError}
            </div>
          )}
          {result?.kind === 'not_found' && (
            <div className="border-t border-white/15 px-5 py-3 text-[12px] text-white/50">
              no user matched.
            </div>
          )}
        </section>

        {/* User dossier */}
        {user && found && (
          <section
            className="mt-6 border-2 border-white/20 bg-black"
            style={{ borderRadius: 2 }}
          >
            {/* Ban banner */}
            {user.banned_at ? (
              <div className="flex flex-col gap-1 border-b-2 border-rose-500 bg-rose-500/[0.06] px-5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-300">
                  BANNED · {new Date(user.banned_at).toLocaleString()}
                </span>
                <span
                  className="text-[13px] text-rose-100"
                  style={{ textTransform: 'none' }}
                >
                  {user.banned_reason || '(no reason on record)'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 border-b-2 border-emerald-500/60 bg-emerald-500/[0.04] px-5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                  IN GOOD STANDING
                </span>
              </div>
            )}

            <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[18px] font-bold text-white">
                  @{user.display_name}
                </span>
                <span
                  className="truncate text-[12px] text-white/50"
                  style={{ textTransform: 'none' }}
                >
                  {user.email ?? '(no email)'}
                </span>
                <span
                  className="truncate font-mono text-[11px] text-white/30"
                  style={{ textTransform: 'none' }}
                >
                  {user.user_id}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {user.banned_at ? (
                  <button
                    type="button"
                    onClick={onUnban}
                    disabled={actionState['unban'] === 'pending'}
                    className="flex items-center gap-1.5 border-2 border-emerald-400 bg-emerald-400 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ borderRadius: 2 }}
                  >
                    {actionState['unban'] === 'pending' ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Check size={11} />
                    )}
                    UNBAN
                  </button>
                ) : null}
              </div>
            </header>

            {/* Counters */}
            <dl className="grid grid-cols-2 gap-px border-t border-white/15 bg-white/15 sm:grid-cols-4">
              <Stat label="ELO" value={String(user.elo)} accent="amber" />
              <Stat label="PEAK ELO" value={String(user.peak_elo)} accent="amber" />
              <Stat
                label="MATCHES"
                value={`${user.matches_won}/${user.matches_played}`}
                accent="sky"
              />
              <Stat
                label="BEST SCAN"
                value={user.best_scan_overall != null ? String(user.best_scan_overall) : '—'}
                accent="emerald"
              />
              <Stat
                label="SUBSCRIPTION"
                value={user.subscription_status ?? 'none'}
                accent="violet"
              />
              <Stat
                label="SESSIONS"
                value={String(user.active_sessions)}
                accent="white"
              />
              <Stat
                label="CREATED"
                value={shortDate(user.created_at)}
                accent="white"
              />
              <Stat
                label="UPDATED"
                value={user.updated_at ? shortDate(user.updated_at) : '—'}
                accent="white"
              />
            </dl>

            {/* Ban form (only when not currently banned) */}
            {!user.banned_at && (
              <div className="border-t border-white/15 px-5 py-4">
                <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-rose-400">
                  BAN USER
                </span>
                <p
                  className="mt-1 text-[11px] text-white/50"
                  style={{ textTransform: 'none' }}
                >
                  reason is emailed verbatim to the user. their sessions are
                  killed immediately and signin is blocked.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="reason (required, ≤500 chars)"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={500}
                    className="flex-1 border-2 border-white/30 bg-black px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-rose-400 focus:outline-none"
                    style={{ borderRadius: 2, textTransform: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={onBan}
                    disabled={banPending || !banReason.trim()}
                    className="flex items-center justify-center gap-1.5 border-2 border-rose-500 bg-rose-500 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ borderRadius: 2 }}
                  >
                    {banPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Ban size={12} />
                    )}
                    BAN
                  </button>
                </div>
                {banError && (
                  <div className="mt-2 text-[11px] text-rose-300">
                    <AlertTriangle size={11} className="mr-1 inline" aria-hidden />{' '}
                    {banError}
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard entry */}
            <div className="border-t border-white/15 px-5 py-4">
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                LEADERBOARD
              </span>
              {found.leaderboard ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] text-white">
                      OVERALL {found.leaderboard.overall} · submitted{' '}
                      {shortDate(found.leaderboard.created_at)}
                    </span>
                    {found.leaderboard.image_url && (
                      <a
                        href={found.leaderboard.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 underline"
                        style={{ textTransform: 'none' }}
                      >
                        <Eye size={11} /> view photo
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onDeleteLeaderboard}
                    disabled={actionState['lb'] === 'pending'}
                    className="flex items-center gap-1.5 border-2 border-rose-500/70 bg-black px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ borderRadius: 2 }}
                  >
                    {actionState['lb'] === 'pending' ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                    REMOVE
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-[12px] text-white/40">
                  no leaderboard entry.
                </p>
              )}
              {actionError['lb'] && (
                <div className="mt-2 text-[11px] text-rose-300">{actionError['lb']}</div>
              )}
            </div>

            {/* Scan history */}
            <div className="border-t border-white/15 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                  SCAN HISTORY · LAST {found.scans.length}
                </span>
              </div>
              {found.scans.length === 0 ? (
                <p className="mt-2 text-[12px] text-white/40">no scans yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-px bg-white/15">
                  {found.scans.map((scan) => {
                    const k = `scan:${scan.id}`;
                    const pending = actionState[k] === 'pending';
                    return (
                      <li
                        key={scan.id}
                        className="flex items-center justify-between gap-3 bg-black px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="border border-emerald-400/60 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-300"
                            style={{ borderRadius: 2 }}
                          >
                            {scan.overall}
                          </span>
                          <span className="hidden text-[10px] text-white/40 sm:inline">
                            J{scan.jawline} · E{scan.eyes} · S{scan.skin} · C{scan.cheekbones}
                          </span>
                          <span
                            className="ml-auto truncate text-[10px] text-white/40"
                            style={{ textTransform: 'none' }}
                          >
                            {shortDate(scan.created_at)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteScan(scan.id)}
                          disabled={pending}
                          className="flex items-center gap-1 border border-rose-500/60 bg-black px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ borderRadius: 2 }}
                          aria-label={`delete scan ${scan.id}`}
                        >
                          {pending ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Trash2 size={10} />
                          )}
                          DEL
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Per-user audit log */}
            <div className="border-t border-white/15 px-5 py-4">
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                AUDIT TRAIL · LAST {found.audit.length}
              </span>
              {found.audit.length === 0 ? (
                <p className="mt-2 text-[12px] text-white/40">
                  no events for this user.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {found.audit.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Global audit feed */}
        <section
          className="mt-6 border-2 border-white/20 bg-black"
          style={{ borderRadius: 2 }}
        >
          <header className="flex items-center justify-between px-5 pb-3 pt-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center border border-white/25 bg-white/[0.04]"
                style={{ borderRadius: 2 }}
              >
                <Eye size={18} className="text-white" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-bold uppercase tracking-[0.12em] text-white">
                  RECENT ACTIVITY · GLOBAL
                </span>
                <span className="text-[12px] text-white/50">
                  last 100 events across all users
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={refreshGlobalAudit}
              disabled={globalAuditLoading}
              className="flex items-center gap-1.5 border-2 border-white/30 bg-black px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:border-white disabled:opacity-40"
              style={{ borderRadius: 2 }}
            >
              {globalAuditLoading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} />
              )}
              REFRESH
            </button>
          </header>
          <div className="border-t border-white/15 px-5 py-3">
            {globalAudit === null ? (
              <p className="text-[12px] text-white/40">loading…</p>
            ) : globalAudit.length === 0 ? (
              <p className="text-[12px] text-white/40">no events yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {globalAudit.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} showUser />
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'white';
}) {
  const accentClass = {
    amber: 'text-amber-300',
    sky: 'text-sky-300',
    emerald: 'text-emerald-300',
    violet: 'text-violet-300',
    white: 'text-white',
  }[accent];
  return (
    <div className="flex flex-col gap-0.5 bg-black px-4 py-3">
      <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/40">
        {label}
      </span>
      <span
        className={`truncate font-mono text-[13px] tabular-nums ${accentClass}`}
        style={{ textTransform: 'none' }}
      >
        {value}
      </span>
    </div>
  );
}

function AuditRow({
  entry,
  showUser,
}: {
  entry: AdminAuditEntry;
  showUser?: boolean;
}) {
  return (
    <li
      className="flex items-center gap-2 border-l-2 border-white/15 bg-white/[0.02] px-2 py-1 text-[11px]"
      style={{ borderRadius: 2 }}
    >
      <span className="font-mono text-[10px] text-white/40" style={{ textTransform: 'none' }}>
        {shortDateTime(entry.created_at)}
      </span>
      <span
        className="border border-white/25 bg-black px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white"
        style={{ borderRadius: 2 }}
      >
        {entry.action}
      </span>
      {showUser && entry.user_id && (
        <span
          className="truncate font-mono text-[10px] text-white/40"
          style={{ textTransform: 'none' }}
        >
          {entry.user_id.slice(0, 8)}…
        </span>
      )}
      {entry.resource && (
        <span
          className="truncate font-mono text-[10px] text-white/30"
          style={{ textTransform: 'none' }}
        >
          ↳ {entry.resource.slice(0, 12)}
        </span>
      )}
    </li>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
