'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  Crown,
  Flag,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';

/**
 * Staff console UI. Server gates the page at /admin via requireAdmin(),
 * so by the time this client renders we know the caller is an admin.
 * Every action still re-checks on the server — never trust the gate
 * here alone.
 *
 * Layout: top sticky header + tab nav, then one of four tab panes:
 *   Overview — site-wide metric cards + recent activity peek
 *   Lookup   — find a user by handle / email / uuid, full dossier
 *   Reports  — pending battle_reports queue with inline ban/dismiss
 *   Activity — global audit log (last 100 events)
 *
 * Visual language: soft zinc-900 cards on a near-black surface with
 * 1px zinc-800 borders, rounded-lg corners, generous spacing. Numbers
 * use the regular sans with tabular-nums (no monospace) so the whole
 * thing reads like a refined admin tool, not a terminal dashboard.
 */

type Tab = 'overview' | 'lookup' | 'reports' | 'activity';

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

type Metrics = {
  total_users: number;
  signups_today: number;
  total_scans: number;
  scans_today: number;
  total_battles: number;
  battles_today: number;
  total_subscribers: number;
  leaderboard_total: number;
  pending_reports: number;
  banned_users: number;
};

type PendingReport = {
  id: string;
  battle_id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reporter_name: string | null;
  reported_name: string | null;
  reported_already_banned: boolean;
  reason: string;
  details: string | null;
  created_at: string;
};

export function AdminConsole({ adminUserId }: { adminUserId: string }) {
  const [tab, setTab] = useState<Tab>('overview');
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

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [reports, setReports] = useState<PendingReport[] | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportActionState, setReportActionState] = useState<
    Record<string, 'idle' | 'pending' | 'done' | 'error'>
  >({});
  const [reportActionError, setReportActionError] = useState<
    Record<string, string>
  >({});

  const [viewAsPending, setViewAsPending] = useState(false);
  const [viewAsError, setViewAsError] = useState<string | null>(null);

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

  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      // Pass the browser's IANA timezone so "today" counters use the
      // admin's local midnight instead of UTC midnight.
      const tz =
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC';
      const res = await fetch(
        `/api/admin/metrics?tz=${encodeURIComponent(tz)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setMetrics(null);
        return;
      }
      const data = (await res.json()) as Metrics;
      setMetrics(data);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const refreshReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch('/api/admin/reports?limit=50', {
        cache: 'no-store',
      });
      if (!res.ok) {
        setReports(null);
        return;
      }
      const data = (await res.json()) as { entries: PendingReport[] };
      setReports(data.entries);
    } catch {
      setReports(null);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGlobalAudit();
    void refreshMetrics();
    void refreshReports();
  }, [refreshGlobalAudit, refreshMetrics, refreshReports]);

  const onResolveReport = useCallback(
    async (reportId: string, action: 'ban' | 'dismiss') => {
      const r = reports?.find((x) => x.id === reportId);
      if (!r) return;
      if (
        !window.confirm(
          action === 'ban'
            ? `BAN @${r.reported_name ?? r.reported_user_id.slice(0, 8)} from this report?\n\nreason that will be emailed:\n${r.reason}`
            : `dismiss report against @${r.reported_name ?? r.reported_user_id.slice(0, 8)}? no user action, no email.`,
        )
      ) {
        return;
      }
      setReportActionState((s) => ({ ...s, [reportId]: 'pending' }));
      setReportActionError((e) => {
        const next = { ...e };
        delete next[reportId];
        return next;
      });
      try {
        const res = await fetch('/api/admin/report-resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reportId, action }),
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setReportActionError((e) => ({
            ...e,
            [reportId]: body.error ?? `failed (${res.status})`,
          }));
          setReportActionState((s) => ({ ...s, [reportId]: 'error' }));
          return;
        }
        setReportActionState((s) => ({ ...s, [reportId]: 'done' }));
        await Promise.all([refreshReports(), refreshMetrics()]);
      } catch (err) {
        setReportActionError((e) => ({
          ...e,
          [reportId]: err instanceof Error ? err.message : 'failed',
        }));
        setReportActionState((s) => ({ ...s, [reportId]: 'error' }));
      }
    },
    [reports, refreshReports, refreshMetrics],
  );

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

  const onViewAs = useCallback(async () => {
    if (!user) return;
    if (
      !window.confirm(
        `enter @${user.display_name}'s account?\n\nyou will be acting as them. every click on every page is performed as this user until you click EXIT on the banner at the top of the page.\n\naudit log still records every action against your admin id.`,
      )
    ) {
      return;
    }
    setViewAsPending(true);
    setViewAsError(null);
    try {
      const res = await fetch('/api/admin/impersonate/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setViewAsError(body.error ?? `failed (${res.status})`);
        return;
      }
      // Hard navigation so the new ImpersonationBanner server component
      // gets read with the freshly-set cookie. router.push wouldn't
      // re-evaluate the layout in some prefetch / RSC cache states.
      if (typeof window !== 'undefined') {
        window.location.assign('/account?tab=settings');
      }
    } catch (err) {
      setViewAsError(err instanceof Error ? err.message : 'failed');
    } finally {
      setViewAsPending(false);
    }
  }, [user]);

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

  const pendingReportsCount =
    reports?.length ?? metrics?.pending_reports ?? 0;

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      {/* Sticky top chrome — brand + operator on row 1, tabs on row 2.
          Sits in a backdrop-blur container so content scrolls under
          cleanly. */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10"
            >
              <ShieldCheck size={16} className="text-rose-400" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400">
                Staff
              </span>
              <h1 className="truncate text-[14px] font-semibold text-white">
                Holymog admin
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-[11px] text-zinc-400 sm:inline-flex">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
            />
            <span className="font-mono text-[11px] text-zinc-400">
              Operator {adminUserId.slice(0, 8)}
            </span>
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-5xl items-center gap-0.5 overflow-x-auto px-3 pb-1.5">
          <AdminTabButton
            active={tab === 'overview'}
            onClick={() => setTab('overview')}
            icon={<LayoutDashboard size={13} />}
            label="Overview"
          />
          <AdminTabButton
            active={tab === 'lookup'}
            onClick={() => setTab('lookup')}
            icon={<Users size={13} />}
            label="Lookup"
          />
          <AdminTabButton
            active={tab === 'reports'}
            onClick={() => setTab('reports')}
            icon={<Flag size={13} />}
            label="Reports"
            badge={pendingReportsCount > 0 ? pendingReportsCount : undefined}
          />
          <AdminTabButton
            active={tab === 'activity'}
            onClick={() => setTab('activity')}
            icon={<Activity size={13} />}
            label="Activity"
          />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-6">
        {/* ---- Overview tab — hero metrics + recent activity ---- */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[20px] font-semibold leading-tight text-white">
                  Overview
                </h2>
                <p className="text-[13px] text-zinc-400">
                  Live counters across the platform — refresh to recompute.
                </p>
              </div>
              <AdminGhostButton
                onClick={refreshMetrics}
                disabled={metricsLoading}
                icon={metricsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              >
                Refresh
              </AdminGhostButton>
            </div>

            {metrics === null && !metricsLoading ? (
              <AdminCard>
                <p className="text-[13px] text-zinc-500">
                  Couldn&apos;t load metrics. Try refresh.
                </p>
              </AdminCard>
            ) : metrics === null ? (
              <AdminCard>
                <p className="text-[13px] text-zinc-500">Loading metrics…</p>
              </AdminCard>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard
                  label="Users"
                  value={fmt(metrics.total_users)}
                  accent="zinc"
                />
                <MetricCard
                  label="Signups today"
                  value={fmt(metrics.signups_today)}
                  accent="sky"
                  highlight
                />
                <MetricCard
                  label="Scans"
                  value={fmt(metrics.total_scans)}
                  accent="zinc"
                />
                <MetricCard
                  label="Scans today"
                  value={fmt(metrics.scans_today)}
                  accent="emerald"
                  highlight
                />
                <MetricCard
                  label="Battles"
                  value={fmt(metrics.total_battles)}
                  accent="zinc"
                />
                <MetricCard
                  label="Battles today"
                  value={fmt(metrics.battles_today)}
                  accent="emerald"
                  highlight
                />
                <MetricCard
                  label="Subscribers"
                  value={fmt(metrics.total_subscribers)}
                  accent="amber"
                />
                <MetricCard
                  label="Leaderboard"
                  value={fmt(metrics.leaderboard_total)}
                  accent="violet"
                />
                <MetricCard
                  label="Pending reports"
                  value={fmt(metrics.pending_reports)}
                  accent={metrics.pending_reports > 0 ? 'rose' : 'zinc'}
                  highlight={metrics.pending_reports > 0}
                />
                <MetricCard
                  label="Banned"
                  value={fmt(metrics.banned_users)}
                  accent="rose"
                />
              </div>
            )}

            {/* Recent activity peek — last 10 events. Click "Open activity" to
                jump to the dedicated tab. */}
            <AdminCard
              title="Recent activity"
              description="Last 10 events across the platform."
              action={
                <button
                  type="button"
                  onClick={() => setTab('activity')}
                  className="text-[12px] font-medium text-zinc-400 transition-colors hover:text-white"
                >
                  Open activity →
                </button>
              }
            >
              {globalAudit === null ? (
                <p className="text-[13px] text-zinc-500">Loading…</p>
              ) : globalAudit.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  No events yet.
                </p>
              ) : (
                <ul className="-mx-1 flex flex-col">
                  {globalAudit.slice(0, 10).map((entry) => (
                    <AuditEventRow key={entry.id} entry={entry} showUser />
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        )}

        {/* ---- Reports tab — pending battle reports queue ---- */}
        {tab === 'reports' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[20px] font-semibold leading-tight text-white">
                  Pending reports
                </h2>
                <p className="text-[13px] text-zinc-400">
                  Oldest first. Ban or dismiss inline — both audit-logged.
                </p>
              </div>
              <AdminGhostButton
                onClick={refreshReports}
                disabled={reportsLoading}
                icon={reportsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              >
                Refresh
              </AdminGhostButton>
            </div>

            <AdminCard noPadding>
              <div className="px-5 py-4">
                {reports === null && !reportsLoading ? (
                  <p className="text-[13px] text-zinc-500">Couldn&apos;t load reports.</p>
                ) : reports === null ? (
                  <p className="text-[13px] text-zinc-500">Loading…</p>
                ) : reports.length === 0 ? (
                  <div className="flex items-center gap-2 text-[13px] text-emerald-300/90">
                    <Check size={14} aria-hidden />
                    Queue empty — nothing pending.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {reports.map((r) => {
                      const state = reportActionState[r.id] ?? 'idle';
                      const err = reportActionError[r.id];
                      return (
                        <li
                          key={r.id}
                          className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
                                Reported @{r.reported_name ?? r.reported_user_id.slice(0, 8)}
                                {r.reported_already_banned && (
                                  <StatusPill tone="rose">Already banned</StatusPill>
                                )}
                              </span>
                              <span className="truncate text-[12px] text-zinc-500">
                                By @{r.reporter_name ?? r.reporter_user_id.slice(0, 8)} · {shortDateTime(r.created_at)}
                              </span>
                            </div>
                            <div className="flex flex-shrink-0 gap-1.5">
                              <AdminDangerButton
                                onClick={() => onResolveReport(r.id, 'ban')}
                                disabled={state === 'pending'}
                                icon={state === 'pending' ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                              >
                                Ban
                              </AdminDangerButton>
                              <AdminGhostButton
                                onClick={() => onResolveReport(r.id, 'dismiss')}
                                disabled={state === 'pending'}
                                icon={<X size={12} />}
                              >
                                Dismiss
                              </AdminGhostButton>
                            </div>
                          </div>
                          <div className="rounded-md border-l-2 border-zinc-700 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-200">
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              Reason
                            </span>
                            <span>{r.reason}</span>
                            {r.details && (
                              <>
                                <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                  Details
                                </span>
                                <span>{r.details}</span>
                              </>
                            )}
                          </div>
                          {err && (
                            <div className="flex items-center gap-1.5 text-[12px] text-rose-300">
                              <AlertTriangle size={12} aria-hidden /> {err}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </AdminCard>
          </div>
        )}

        {/* ---- Lookup tab — search + user dossier ---- */}
        {tab === 'lookup' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-semibold leading-tight text-white">
              Lookup
            </h2>
            <p className="text-[13px] text-zinc-400">
              Find a user by @username, email, or UUID. Exact match only.
            </p>
          </div>
          <AdminCard noPadding>
            <form
              onSubmit={onSearch}
              className="flex items-stretch gap-2 px-4 py-4"
            >
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  aria-hidden
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="@someone, email, or uuid"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 pl-9 text-[14px] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-zinc-600 focus:bg-zinc-900/80 focus:outline-none"
                  style={{ textTransform: 'none' }}
                />
              </div>
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {searching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>Search</>
                )}
              </button>
            </form>
            {searchError && (
              <div className="border-t border-rose-500/30 bg-rose-500/[0.05] px-5 py-3 text-[13px] text-rose-300">
                <AlertTriangle size={12} className="mr-1 inline" aria-hidden /> {searchError}
              </div>
            )}
            {result?.kind === 'not_found' && (
              <div className="border-t border-zinc-800 px-5 py-3 text-[13px] text-zinc-500">
                No user matched.
              </div>
            )}
          </AdminCard>
        </div>
        )}

        {/* ---- User dossier (Lookup tab only) ---- */}
        {tab === 'lookup' && user && found && (
          <div className="mt-6 flex flex-col gap-4">
            {/* Status banner — banned in rose, otherwise emerald. */}
            {user.banned_at ? (
              <div className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-4 py-3">
                <Ban size={16} className="mt-0.5 text-rose-400" aria-hidden />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[12px] font-semibold text-rose-200">
                    Banned · {new Date(user.banned_at).toLocaleString()}
                  </span>
                  <span className="text-[13px] text-rose-100/90">
                    {user.banned_reason || '(no reason on record)'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-2.5">
                <Check size={14} className="text-emerald-400" aria-hidden />
                <span className="text-[13px] text-emerald-200">
                  In good standing
                </span>
              </div>
            )}

            {/* Identity + action bar */}
            <AdminCard noPadding>
              <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[20px] font-semibold text-white">
                      @{user.display_name}
                    </span>
                    {user.subscription_status === 'active' ||
                    user.subscription_status === 'trialing' ? (
                      <StatusPill tone="amber" icon={<Crown size={10} />}>
                        Subscriber
                      </StatusPill>
                    ) : null}
                    {user.hide_elo && (
                      <StatusPill tone="zinc">ELO hidden</StatusPill>
                    )}
                    {user.hide_photo_from_leaderboard && (
                      <StatusPill tone="zinc">Photo hidden</StatusPill>
                    )}
                  </div>
                  <span className="truncate text-[13px] text-zinc-400">
                    {user.email ?? '(no email on file)'}
                  </span>
                  <span className="truncate font-mono text-[11px] text-zinc-600">
                    {user.user_id}
                  </span>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <AdminGhostButton
                    onClick={onViewAs}
                    disabled={viewAsPending}
                    icon={viewAsPending ? <Loader2 size={13} className="animate-spin" /> : <UserCog size={13} />}
                    accent="amber"
                  >
                    View as
                  </AdminGhostButton>
                  {user.banned_at && (
                    <AdminPrimaryButton
                      onClick={onUnban}
                      disabled={actionState['unban'] === 'pending'}
                      icon={actionState['unban'] === 'pending' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      tone="emerald"
                    >
                      Unban
                    </AdminPrimaryButton>
                  )}
                </div>
              </div>
              {viewAsError && (
                <div className="border-t border-zinc-800 px-5 py-2 text-[12px] text-rose-300">
                  {viewAsError}
                </div>
              )}

              {/* Counters */}
              <div className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800 sm:grid-cols-4">
                <DossierStat label="ELO" value={String(user.elo)} accent="amber" />
                <DossierStat label="Peak ELO" value={String(user.peak_elo)} accent="amber" />
                <DossierStat
                  label="Matches"
                  value={`${user.matches_won}/${user.matches_played}`}
                  accent="sky"
                />
                <DossierStat
                  label="Best scan"
                  value={user.best_scan_overall != null ? String(user.best_scan_overall) : '—'}
                  accent="emerald"
                />
                <DossierStat
                  label="Subscription"
                  value={user.subscription_status ?? 'none'}
                  accent="violet"
                />
                <DossierStat
                  label="Sessions"
                  value={String(user.active_sessions)}
                  accent="zinc"
                />
                <DossierStat
                  label="Created"
                  value={shortDate(user.created_at)}
                  accent="zinc"
                />
                <DossierStat
                  label="Updated"
                  value={user.updated_at ? shortDate(user.updated_at) : '—'}
                  accent="zinc"
                />
              </div>
            </AdminCard>

            {/* Ban form (only when not currently banned) */}
            {!user.banned_at && (
              <AdminCard
                title="Ban user"
                description="Reason is emailed verbatim to the user. Their sessions are killed immediately and sign-in is blocked."
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Reason (required, ≤500 chars)"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={500}
                    className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-[14px] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-rose-500/60 focus:bg-zinc-900/80 focus:outline-none"
                    style={{ textTransform: 'none' }}
                  />
                  <AdminDangerButton
                    onClick={onBan}
                    disabled={banPending || !banReason.trim()}
                    icon={banPending ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                  >
                    Ban
                  </AdminDangerButton>
                </div>
                {banError && (
                  <div className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-300">
                    <AlertTriangle size={12} aria-hidden /> {banError}
                  </div>
                )}
              </AdminCard>
            )}

            {/* Leaderboard entry */}
            <AdminCard title="Leaderboard">
              {found.leaderboard ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[14px] text-white">
                      Overall {found.leaderboard.overall} · submitted{' '}
                      {shortDate(found.leaderboard.created_at)}
                    </span>
                    {found.leaderboard.image_url && (
                      <a
                        href={found.leaderboard.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[12px] text-sky-400 transition-colors hover:text-sky-300 hover:underline"
                      >
                        View submitted photo →
                      </a>
                    )}
                  </div>
                  <AdminDangerButton
                    onClick={onDeleteLeaderboard}
                    disabled={actionState['lb'] === 'pending'}
                    icon={actionState['lb'] === 'pending' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    variant="outline"
                  >
                    Remove
                  </AdminDangerButton>
                </div>
              ) : (
                <p className="text-[13px] text-zinc-500">
                  No leaderboard entry.
                </p>
              )}
              {actionError['lb'] && (
                <div className="mt-2 text-[12px] text-rose-300">{actionError['lb']}</div>
              )}
            </AdminCard>

            {/* Scan history */}
            <AdminCard
              title={`Scan history · last ${found.scans.length}`}
              noPadding
            >
              <div className="px-5 py-4">
                {found.scans.length === 0 ? (
                  <p className="text-[13px] text-zinc-500">No scans yet.</p>
                ) : (
                  <ul className="-mx-2 flex flex-col">
                    {found.scans.map((scan) => {
                      const k = `scan:${scan.id}`;
                      const pending = actionState[k] === 'pending';
                      return (
                        <li
                          key={scan.id}
                          className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-zinc-800/40"
                        >
                          <span
                            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-emerald-300"
                          >
                            {scan.overall}
                          </span>
                          <span className="hidden text-[11px] text-zinc-500 sm:inline">
                            J{scan.jawline} · E{scan.eyes} · S{scan.skin} · C{scan.cheekbones}
                          </span>
                          <span className="ml-auto truncate text-[11px] text-zinc-500">
                            {shortDate(scan.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteScan(scan.id)}
                            disabled={pending}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Delete scan ${scan.id}`}
                          >
                            {pending ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </AdminCard>

            {/* Per-user audit log */}
            <AdminCard
              title={`Audit trail · last ${found.audit.length}`}
              noPadding
            >
              <div className="px-5 py-4">
                {found.audit.length === 0 ? (
                  <p className="text-[13px] text-zinc-500">
                    No events for this user.
                  </p>
                ) : (
                  <ul className="-mx-1 flex flex-col">
                    {found.audit.map((entry) => (
                      <AuditEventRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </div>
            </AdminCard>
          </div>
        )}

        {/* ---- Activity tab — full global audit log ---- */}
        {tab === 'activity' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[20px] font-semibold leading-tight text-white">
                  Activity
                </h2>
                <p className="text-[13px] text-zinc-400">
                  Last 100 events across every user — forensic trail for incident triage.
                </p>
              </div>
              <AdminGhostButton
                onClick={refreshGlobalAudit}
                disabled={globalAuditLoading}
                icon={globalAuditLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              >
                Refresh
              </AdminGhostButton>
            </div>

            <AdminCard noPadding>
              <div className="px-5 py-4">
                {globalAudit === null ? (
                  <p className="text-[13px] text-zinc-500">Loading…</p>
                ) : globalAudit.length === 0 ? (
                  <p className="text-[13px] text-zinc-500">No events yet.</p>
                ) : (
                  <ul className="-mx-1 flex flex-col">
                    {globalAudit.map((entry) => (
                      <AuditEventRow key={entry.id} entry={entry} showUser />
                    ))}
                  </ul>
                )}
              </div>
            </AdminCard>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Admin design primitives — small, opinionated components shared
// across the tabs. They commit to one visual language: zinc-900 cards
// on a near-black surface with 1px zinc-800 borders, rounded-md
// corners, generous padding, and motion only on hover. Numbers are
// tabular-nums but NOT monospace — keeps the panel reading like a
// modern admin tool rather than a terminal dashboard.
// ---------------------------------------------------------------------

function AdminTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white'
          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100'
      }`}
    >
      <span className={active ? 'text-white' : 'text-zinc-500'}>{icon}</span>
      {label}
      {badge !== undefined && (
        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500/20 px-1 text-[10px] font-bold tabular-nums text-rose-300">
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-white"
        />
      )}
    </button>
  );
}

function AdminCard({
  title,
  description,
  action,
  noPadding,
  children,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          {title && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-white">
                {title}
              </span>
              {description && (
                <span className="text-[12px] text-zinc-400">{description}</span>
              )}
            </div>
          )}
          {action}
        </header>
      )}
      <div className={noPadding ? '' : 'px-5 py-4'}>{children}</div>
    </section>
  );
}

const METRIC_ACCENTS = {
  zinc: 'text-zinc-100',
  sky: 'text-sky-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  violet: 'text-violet-300',
  rose: 'text-rose-300',
} as const;

type MetricAccent = keyof typeof METRIC_ACCENTS;

function MetricCard({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  accent: MetricAccent;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border bg-zinc-900/60 px-4 py-4 transition-colors ${
        highlight
          ? 'border-zinc-700/80 hover:border-zinc-600'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span
        className={`text-[26px] font-semibold leading-none tabular-nums ${METRIC_ACCENTS[accent]}`}
      >
        {value}
      </span>
    </div>
  );
}

const DOSSIER_STAT_ACCENTS = {
  zinc: 'text-zinc-200',
  sky: 'text-sky-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  violet: 'text-violet-300',
} as const;

type DossierStatAccent = keyof typeof DOSSIER_STAT_ACCENTS;

function DossierStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: DossierStatAccent;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-zinc-900/80 px-4 py-3">
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      <span
        className={`truncate text-[15px] font-semibold tabular-nums ${DOSSIER_STAT_ACCENTS[accent]}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: 'rose' | 'amber' | 'emerald' | 'zinc';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass = {
    rose: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    amber: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    emerald: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    zinc: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}
    >
      {icon}
      {children}
    </span>
  );
}

function AdminGhostButton({
  onClick,
  disabled,
  icon,
  accent,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  accent?: 'amber';
  children: React.ReactNode;
}) {
  const accentClass = accent === 'amber'
    ? 'border-amber-500/40 bg-amber-500/[0.05] text-amber-200 hover:bg-amber-500/[0.1]'
    : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ touchAction: 'manipulation' }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${accentClass}`}
    >
      {icon}
      {children}
    </button>
  );
}

function AdminPrimaryButton({
  onClick,
  disabled,
  icon,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  tone?: 'emerald';
  children: React.ReactNode;
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-500 text-black hover:bg-emerald-400'
    : 'bg-white text-black hover:bg-zinc-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ touchAction: 'manipulation' }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {icon}
      {children}
    </button>
  );
}

function AdminDangerButton({
  onClick,
  disabled,
  icon,
  variant = 'solid',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  variant?: 'solid' | 'outline';
  children: React.ReactNode;
}) {
  const variantClass = variant === 'outline'
    ? 'border border-rose-500/50 bg-transparent text-rose-300 hover:bg-rose-500/10'
    : 'bg-rose-500 text-black hover:bg-rose-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ touchAction: 'manipulation' }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClass}`}
    >
      {icon}
      {children}
    </button>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function AuditEventRow({
  entry,
  showUser,
}: {
  entry: AdminAuditEntry;
  showUser?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-zinc-800/40">
      <span className="font-mono text-[11px] text-zinc-500">
        {shortDateTime(entry.created_at)}
      </span>
      <span className="rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-200">
        {entry.action}
      </span>
      {showUser && entry.user_id && (
        <span className="truncate font-mono text-[11px] text-zinc-500">
          {entry.user_id.slice(0, 8)}…
        </span>
      )}
      {entry.resource && (
        <span className="ml-auto truncate font-mono text-[11px] text-zinc-600">
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
