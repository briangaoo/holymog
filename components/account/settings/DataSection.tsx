'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  Loader2,
  Skull,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { ConfirmModal } from '@/components/ConfirmModal';
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

  // Custom-modal state for each destructive action. We don't use a
  // single 'open: string | null' because the modals open and close
  // independently and each has its own pending/result lifecycle.
  const [resetOpen, setResetOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const doResetStats = useCallback(async () => {
    setResetOpen(false);
    setResetState({ kind: 'pending' });
    const res = await onResetStats();
    if (!res.ok) {
      setResetState({ kind: 'error', message: res.message ?? 'failed' });
      return;
    }
    setResetState({ kind: 'saved' });
    window.setTimeout(() => setResetState({ kind: 'idle' }), 1800);
  }, [onResetStats]);

  const doRemoveLeaderboard = useCallback(async () => {
    setRemoveOpen(false);
    setRemoveState({ kind: 'pending' });
    const res = await onRemoveLeaderboard();
    if (!res.ok) {
      setRemoveState({ kind: 'error', message: res.message ?? 'failed' });
      return;
    }
    setRemoveState({ kind: 'saved' });
    window.setTimeout(() => setRemoveState({ kind: 'idle' }), 1800);
  }, [onRemoveLeaderboard]);

  const doDeleteAccount = useCallback(async () => {
    setDeleteOpen(false);
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

  // Public-facing triggers — these open the custom ConfirmModal
  // instead of calling window.confirm/prompt. DangerRow still calls
  // these with the same signatures.
  const resetStats = useCallback(() => setResetOpen(true), []);
  const removeLeaderboard = useCallback(() => setRemoveOpen(true), []);
  const deleteAccount = useCallback(() => setDeleteOpen(true), []);

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
        description="Export everything we have about you."
        icon={Database}
        accent="cyan"
      >
        <DataRow
          title="Download my data"
          description="Exports profile, scans, battles, ELO history, and purchases as a single mog.json file."
          action="Download"
          state={downloadState}
          onClick={downloadData}
          icon={Download}
        />
      </Section>

      <Section
        id="danger"
        label="danger zone"
        description="Permanent actions. Cannot be undone."
        icon={Skull}
        accent="red"
        meta={
          <span className="inline-flex items-center gap-1 text-[11px] text-red-300/80">
            <AlertTriangle size={11} aria-hidden /> Destructive
          </span>
        }
      >
        {/* Sign out lives here too because there's nowhere safer for it
            on this page — it's not destructive but it does kick you out
            of the session, so it sits at the top of the danger list as
            the mildest entry. */}
        <DangerRow
          title="Sign out"
          description="End this session on this device. You'll need to sign in again."
          action="Sign out"
          state={{ kind: 'idle' }}
          onClick={onSignOut}
        />
        <DangerRow
          title="Reset stats"
          description="ELO → 1000, counters → 0, best scan cleared. Battle history rows kept."
          action="Reset"
          state={resetState}
          onClick={resetStats}
        />
        <DangerRow
          title="Remove leaderboard entry"
          description={
            hasLeaderboardEntry
              ? 'Delete your photo + score from the public board.'
              : 'No leaderboard entry to remove.'
          }
          action="Remove"
          state={removeState}
          onClick={removeLeaderboard}
          disabled={!hasLeaderboardEntry}
        />
        <DangerRow
          title="Delete account"
          description="Cascades through profile, leaderboard, battles, scans, sessions, purchases."
          action="Delete"
          state={deleteState}
          onClick={deleteAccount}
          variant="solid"
        />
      </Section>

      <ConfirmModal
        open={resetOpen}
        danger
        title="Reset your stats?"
        description={
          <>
            Your ELO returns to <strong className="text-white">1000</strong>{' '}
            and matches, streaks, best scan, and weakness counts are cleared.
            Past battle history rows are kept so you can still see what you
            played, but the aggregate stats reset. Cannot be undone.
          </>
        }
        confirmLabel="Reset"
        onConfirm={doResetStats}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmModal
        open={removeOpen}
        danger
        title="Remove your leaderboard entry?"
        description={
          <>
            Your photo and score are deleted from the public board. You can
            scan again any time to land a new entry.
          </>
        }
        confirmLabel="Remove"
        onConfirm={doRemoveLeaderboard}
        onCancel={() => setRemoveOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        danger
        title="Delete your account?"
        description={
          <>
            Cascades through your profile, leaderboard entry, scan history,
            battles, sessions, and purchases.{' '}
            <strong className="text-white">This is irreversible.</strong> Type{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] uppercase text-white">
              DELETE
            </code>{' '}
            below to confirm.
          </>
        }
        confirmLabel="Delete forever"
        input={{
          placeholder: 'DELETE',
          matchPhrase: 'DELETE',
          autoComplete: 'off',
        }}
        onConfirm={doDeleteAccount}
        onCancel={() => setDeleteOpen(false)}
      />
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
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-white">
            <Check size={11} aria-hidden /> Done
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || ok}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-white">
            <Check size={11} aria-hidden /> Done
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className={
          variant === 'solid'
            ? 'inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-red-500/90 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40'
            : 'inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-red-500/30 bg-red-500/[0.04] px-3 py-2 text-[12px] font-medium text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40'
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
