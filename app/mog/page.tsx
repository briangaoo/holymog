'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Swords, Users, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { BattleRoom } from './BattleRoom';

type Phase =
  | { kind: 'mode-select' }
  | { kind: 'queueing' }
  | { kind: 'joining'; battleId: string }
  | {
      kind: 'active';
      battleId: string;
      token: string;
      url: string;
      startedAt: number;
    }
  | { kind: 'finished'; result: FinishPayload };

type FinishPayload = {
  battle_id: string;
  winner_id: string | null;
  participants: Array<{
    user_id: string;
    display_name: string;
    final_score: number;
    is_winner: boolean;
  }>;
};

export default function MogPage() {
  const { user, loading } = useUser();
  const [phase, setPhase] = useState<Phase>({ kind: 'mode-select' });

  if (loading) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/mog" />
        <main className="mx-auto w-full max-w-md px-5 py-8 text-sm text-zinc-500">
          loading…
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/mog" authContext="to battle" />
        <main className="mx-auto w-full max-w-md px-5 py-8">
          <p className="text-sm text-white">sign in to battle</p>
        </main>
        <AuthModal open onClose={() => {}} next="/mog" context="to battle" />
      </div>
    );
  }

  if (phase.kind === 'active') {
    return (
      <BattleRoom
        battleId={phase.battleId}
        livekitToken={phase.token}
        livekitUrl={phase.url}
        startedAt={phase.startedAt}
        onFinished={(result) => setPhase({ kind: 'finished', result })}
      />
    );
  }

  if (phase.kind === 'finished') {
    return (
      <ResultScreen
        result={phase.result}
        currentUserId={user.id}
        onAgain={() => setPhase({ kind: 'mode-select' })}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader authNext="/mog" />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/"
            aria-label="Back home"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-2xl font-bold text-white">mog battles</h1>
        </div>

        {phase.kind === 'mode-select' && (
          <ModeSelect
            onPaired={(p) => setPhase(p)}
            onQueue={() => setPhase({ kind: 'queueing' })}
          />
        )}

        {phase.kind === 'queueing' && (
          <Queueing
            userId={user.id}
            onPaired={(battleId) =>
              setPhase({ kind: 'joining', battleId })
            }
            onCancel={async () => {
              await fetch('/api/battle/queue', { method: 'DELETE' });
              setPhase({ kind: 'mode-select' });
            }}
          />
        )}

        {phase.kind === 'joining' && (
          <Joining
            battleId={phase.battleId}
            onReady={(token, url, startedAt) =>
              setPhase({
                kind: 'active',
                battleId: phase.battleId,
                token,
                url,
                startedAt,
              })
            }
            onError={() => setPhase({ kind: 'mode-select' })}
          />
        )}
      </main>
    </div>
  );
}

// ---- Mode select -----------------------------------------------------------

function ModeSelect({
  onPaired,
  onQueue,
}: {
  onPaired: (next: Phase) => void;
  onQueue: () => void;
}) {
  const findBattle = useCallback(async () => {
    onQueue();
    try {
      const res = await fetch('/api/battle/queue', { method: 'POST' });
      const data = (await res.json()) as {
        battle_id?: string;
        paired?: boolean;
        queued?: boolean;
        error?: string;
      };
      if (data.battle_id && data.paired) {
        onPaired({ kind: 'joining', battleId: data.battle_id });
      }
      // Otherwise (queued: true), the Queueing component subscribes
      // and waits for a Realtime event.
    } catch {
      // If the POST fails outright, surface and bounce back.
      onPaired({ kind: 'mode-select' });
    }
  }, [onPaired, onQueue]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={findBattle}
        style={{ touchAction: 'manipulation' }}
        className="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-white/10 p-6 text-left transition-all hover:border-white/25"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(249,115,22,0.18) 100%)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(circle, #ef4444, transparent 70%)' }}
        />
        <Search size={26} className="relative text-white" aria-hidden />
        <div className="relative flex flex-col gap-1">
          <span className="text-2xl font-bold text-white">find a battle</span>
          <span className="text-sm text-zinc-200">1v1 against a stranger · ~15s including matchmaking</span>
        </div>
      </button>

      <button
        type="button"
        disabled
        title="coming in Phase 4"
        className="group relative flex cursor-not-allowed flex-col gap-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-left opacity-60"
      >
        <Users size={22} className="text-zinc-400" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-zinc-200">
            create / join private party
          </span>
          <span className="text-xs text-zinc-500">up to 10 players · coming soon</span>
        </div>
      </button>
    </div>
  );
}

// ---- Queueing --------------------------------------------------------------

function Queueing({
  userId,
  onPaired,
  onCancel,
}: {
  userId: string;
  onPaired: (battleId: string) => void;
  onCancel: () => void;
}) {
  // Subscribe to Postgres changes on battle_participants for our user_id.
  // When pair_two() inserts a row for us, the subscription fires and we
  // navigate to /joining.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`mm:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'battle_participants',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: { battle_id?: string } }) => {
          const row = payload.new;
          if (row.battle_id) onPaired(row.battle_id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, onPaired]);

  // Backup: poll /api/battle/queue every ~3s. If the realtime subscription
  // misses an event for any reason, the next poll will pair us via
  // pair_two() (idempotent).
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch('/api/battle/queue', { method: 'POST' });
        const data = (await res.json()) as { battle_id?: string };
        if (data.battle_id) onPaired(data.battle_id);
      } catch {
        // ignore
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [onPaired]);

  return (
    <div className="flex flex-col items-center gap-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <Swords size={36} className="text-zinc-400" aria-hidden />
      </motion.div>
      <div>
        <p className="text-base font-semibold text-white">finding an opponent…</p>
        <p className="mt-1 text-xs text-zinc-500">
          hold tight — usually under 30 seconds
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        style={{ touchAction: 'manipulation' }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs text-white hover:bg-white/[0.07]"
      >
        <X size={12} aria-hidden /> cancel
      </button>
    </div>
  );
}

// ---- Joining (fetch token + battle metadata) -------------------------------

function Joining({
  battleId,
  onReady,
  onError,
}: {
  battleId: string;
  onReady: (token: string, url: string, startedAt: number) => void;
  onError: () => void;
}) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    (async () => {
      try {
        const [tokenRes, battleRes] = await Promise.all([
          fetch(`/api/battle/${battleId}/token`),
          // We pull the battle row through the Supabase REST API to avoid
          // adding another bespoke route. The battles table is world-
          // readable so this is fine.
          fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/battles?id=eq.${battleId}&select=started_at`,
            {
              headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}`,
              },
            },
          ),
        ]);
        if (!tokenRes.ok || !battleRes.ok) {
          onError();
          return;
        }
        const tokenData = (await tokenRes.json()) as { token: string; url: string };
        const battleRows = (await battleRes.json()) as Array<{
          started_at: string | null;
        }>;
        const startedAtIso = battleRows[0]?.started_at;
        const startedAt = startedAtIso ? Date.parse(startedAtIso) : Date.now();
        onReady(tokenData.token, tokenData.url, startedAt);
      } catch {
        onError();
      }
    })();
  }, [battleId, onReady, onError]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      >
        <Swords size={32} className="text-emerald-400" aria-hidden />
      </motion.div>
      <p className="text-sm text-white">opponent found · joining…</p>
    </div>
  );
}

// ---- Result screen ---------------------------------------------------------

function ResultScreen({
  result,
  currentUserId,
  onAgain,
}: {
  result: FinishPayload;
  currentUserId: string;
  onAgain: () => void;
}) {
  const me = result.participants.find((p) => p.user_id === currentUserId);
  const opponent = result.participants.find((p) => p.user_id !== currentUserId);
  const youWon = me?.is_winner === true;

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader authNext="/mog" />
      <main
        className="mx-auto w-full max-w-md px-5 py-8"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
        <h1 className="mb-1 text-3xl font-bold text-white">
          {youWon ? 'you mogged' : me ? 'you got mogged' : 'battle done'}
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          {youWon
            ? 'highest peak score wins. nice.'
            : me
              ? 'rematch in the next one'
              : 'thanks for spectating'}
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3">
          {me && <ResultCell entry={me} you />}
          {opponent && <ResultCell entry={opponent} />}
        </div>

        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
          >
            home
          </Link>
          <button
            type="button"
            onClick={onAgain}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100"
          >
            find another
          </button>
        </div>
      </main>
    </div>
  );
}

function ResultCell({
  entry,
  you,
}: {
  entry: FinishPayload['participants'][number];
  you?: boolean;
}) {
  const tier = getTier(entry.final_score);
  const color = getScoreColor(entry.final_score);
  const tierStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color: tier.color };

  return (
    <div
      className={`relative flex flex-col gap-1 rounded-2xl border px-4 py-3 ${
        entry.is_winner
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {you ? 'you' : 'opponent'}
        {entry.is_winner && (
          <span className="rounded-full bg-emerald-500/20 px-1.5 text-emerald-300 normal-case">
            win
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-num text-3xl font-extrabold tabular-nums"
          style={{ color }}
        >
          {entry.final_score}
        </span>
        <span
          className="font-num text-base font-bold normal-case"
          style={tierStyle}
        >
          {tier.letter}
        </span>
      </div>
      <div className="truncate text-sm text-zinc-300">{entry.display_name}</div>
    </div>
  );
}
