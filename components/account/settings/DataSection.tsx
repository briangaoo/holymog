'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  Loader2,
  LogOut,
  Skull,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { Section, type SaveState } from './shared';

/**
 * Data + danger zone — download (Phase 8), then the destructive
 * controls (reset stats, remove leaderboard entry, sign out, delete
 * account). These are aggregated under one section because they all
 * concern the user's stored data, with the most destructive option
 * (delete) at the bottom.
 */
export function DataSection({
  hasLeaderboardEntry,
  onResetStats,
  onRemoveLeaderboard,
  onDeleteAccount,
}: {
  hasLeaderboardEntry: boolean;
  onResetStats: () => Promise<{ ok: boolean; message?: string }>;
  onRemoveLeaderboard: () => Promise<{ ok: boolean; message?: string }>;
  onDeleteAccount: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const { signOut } = useUser();
  const router = useRouter();

  const [resetState, setResetState] = useState<SaveState>({ kind: 'idle' });
  const [removeState, setRemoveState] = useState<SaveState>({ kind: 'idle' });
  const [deleteState, setDeleteState] = useState<SaveState>({ kind: 'idle' });
  const [downloadState, setDownloadState] = useState<SaveState>({
    kind: 'idle',
  });

  // ---- Download my data --------------------------------------------------
  const downloadData = useCallback(async () => {
    setDownloadState({ kind: 'pending' });
    try {
      const res = await fetch('/api/account/download');
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setDownloadState({
          kind: 'error',
          message: data.error ?? 'failed',
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holymog-${Date.now()}.mog.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadState({ kind: 'saved' });
      window.setTimeout(() => setDownloadState({ kind: 'idle' }), 1800);
    } catch {
      setDownloadState({ kind: 'error', message: 'network error' });
    }
  }, []);

  // ---- Reset stats -------------------------------------------------------
  const resetStats = useCallback(async () => {
    if (
      !window.confirm(
        'Reset all stats? ELO returns to 1000 and your matches, streaks, best scan, and weakness counts are cleared. Past battle history rows are kept. Cannot be undone.',
      )
    ) {
      return;
    }
    setResetState({ kind: 'pending' });
    const res = await onResetStats();
    if (!res.ok) {
      setResetState({
        kind: 'error',
        message: res.message ?? 'failed',
      });
      return;
    }
    setResetState({ kind: 'saved' });
    window.setTimeout(() => setResetState({ kind: 'idle' }), 1800);
  }, [onResetStats]);

  // ---- Remove leaderboard entry -----------------------------------------
  const removeLeaderboard = useCallback(async () => {
    if (
      !window.confirm(
        'Remove your leaderboard entry? Photo and score will be deleted from the public board.',
      )
    ) {
      return;
    }
    setRemoveState({ kind: 'pending' });
    const res = await onRemoveLeaderboard();
    if (!res.ok) {
      setRemoveState({
        kind: 'error',
        message: res.message ?? 'failed',
      });
      return;
    }
    setRemoveState({ kind: 'saved' });
    window.setTimeout(() => setRemoveState({ kind: 'idle' }), 1800);
  }, [onRemoveLeaderboard]);

  // ---- Delete account ---------------------------------------------------
  const deleteAccount = useCallback(async () => {
    const typed = window.prompt(
      'Permanently delete your account, leaderboard entry, scan history, and battle stats. To confirm, type DELETE.',
    );
    if (typed !== 'DELETE') return;
    setDeleteState({ kind: 'pending' });
    const res = await onDeleteAccount();
    if (!res.ok) {
      setDeleteState({ kind: 'error', message: res.message ?? 'failed' });
      return;
    }
    try {
      window.localStorage.removeItem('holymog-last-result');
      window.localStorage.removeItem('holymog-active-battle');
    } catch {
      // ignore
    }
    await signOut();
    router.push('/');
  }, [onDeleteAccount, signOut, router]);

  // ---- Sign out ---------------------------------------------------------
  const onSignOut = useCallback(async () => {
    await signOut();
    router.push('/');
  }, [signOut, router]);

  return (
    <>
      {/* Download (data export) — separate from the danger zone so the
          friendly action isn't visually grouped with destructive ones. */}
      <Section
        id="data"
        label="your data"
        description="export everything we have about you."
        icon={Database}
        accent="cyan"
      >
        <DataRow
          title="download my data"
          description="exports profile, scans, battles, elo history, and purchases as a single mog.json file."
          action="download"
          state={downloadState}
          onClick={downloadData}
          icon={Download}
        />
      </Section>

      <button
        type="button"
        onClick={onSignOut}
        className="self-start inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <LogOut size={12} aria-hidden /> sign out
      </button>

      <Section
        id="danger"
        label="danger zone"
        description="permanent actions. cannot be undone."
        icon={Skull}
        accent="red"
        meta={
          <span className="inline-flex items-center gap-1 text-[11px] text-red-300/80">
            <AlertTriangle size={11} aria-hidden /> destructive
          </span>
        }
      >
        <DangerRow
          title="reset stats"
          description="elo → 1000, counters → 0, best scan cleared. battle history rows kept."
          action="reset"
          state={resetState}
          onClick={resetStats}
        />
        <DangerRow
          title="remove leaderboard entry"
          description={
            hasLeaderboardEntry
              ? 'delete your photo + score from the public board.'
              : 'no leaderboard entry to remove.'
          }
          action="remove"
          state={removeState}
          onClick={removeLeaderboard}
          disabled={!hasLeaderboardEntry}
        />
        <DangerRow
          title="delete account"
          description="cascades through profile, leaderboard, battles, scans, sessions, purchases."
          action="delete"
          state={deleteState}
          onClick={deleteAccount}
          variant="solid"
        />
      </Section>
    </>
  );
}

// ---- Row primitives -------------------------------------------------------

function DataRow({
  title,
  description,
  action,
  state,
  onClick,
  icon: Icon,
}: {
  title: string;
  description: string;
  action: string;
  state: SaveState;
  onClick: () => void;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    'aria-hidden'?: boolean;
  }>;
}) {
  const pending = state.kind === 'pending';
  const ok = state.kind === 'saved';
  return (
    <div className="flex items-center gap-3 border-t border-white/5 px-4 py-4 transition-colors hover:bg-white/[0.015]">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-white">{title}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
          {description}
        </p>
        {state.kind === 'error' && state.message && (
          <p className="mt-1 text-[11px] text-red-300">{state.message}</p>
        )}
        {ok && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-300">
            <Check size={11} aria-hidden /> done
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || ok}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Icon size={12} aria-hidden />
        )}
        {action}
      </button>
    </div>
  );
}

function DangerRow({
  title,
  description,
  action,
  state,
  onClick,
  disabled,
  variant = 'outline',
}: {
  title: string;
  description: string;
  action: string;
  state: SaveState;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'outline' | 'solid';
}) {
  const pending = state.kind === 'pending';
  const ok = state.kind === 'saved';
  const isDisabled = disabled || pending || ok;
  return (
    <div className="flex items-center gap-3 border-t border-white/5 px-4 py-4 transition-colors hover:bg-white/[0.015]">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-white">{title}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
          {description}
        </p>
        {state.kind === 'error' && state.message && (
          <p className="mt-1 text-[11px] text-red-300">{state.message}</p>
        )}
        {ok && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-300">
            <Check size={11} aria-hidden /> done
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className={
          variant === 'solid'
            ? 'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40'
            : 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-3 py-2 text-[12px] font-medium text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40'
        }
      >
        {pending ? (
          <>
            <Loader2 size={12} className="animate-spin" /> {action}
          </>
        ) : (
          action
        )}
      </button>
    </div>
  );
}
