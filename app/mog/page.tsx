'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Loader2,
  Search,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  BATTLE_CODE_LENGTH,
  isValidBattleCode,
  normaliseBattleCode,
} from '@/lib/battle-code';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import {
  clearActiveBattle,
  readActiveBattle,
  writeActiveBattle,
} from '@/lib/activeBattle';
import { generateBattleShareImage } from '@/lib/battleShareImageGenerator';
import { BattleRoom } from './BattleRoom';

type Phase =
  | { kind: 'mode-select' }
  | { kind: 'creating' }
  | { kind: 'join-input' }
  | { kind: 'join-loading'; code: string }
  | {
      kind: 'lobby';
      battleId: string;
      code: string;
      isHost: boolean;
    }
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
  kind?: 'public' | 'private';
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
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'mode-select' });
  // Until reconnection check resolves we don't want to render mode-select
  // for a split second (would flash before navigating into the lobby).
  const [reconnectChecked, setReconnectChecked] = useState(false);

  // Reconnection: on mount, if there's a saved active-battle entry AND
  // its battle row is still in lobby/starting/active, restore the
  // corresponding phase. Otherwise clear the entry. Single-shot per
  // mount, runs only once user identity is loaded.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setReconnectChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const entry = readActiveBattle();
      if (!entry) {
        setReconnectChecked(true);
        return;
      }
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const res = await fetch(
          `${supabaseUrl}/rest/v1/battles?id=eq.${entry.battle_id}&select=state,kind`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          },
        );
        const rows = (await res.json()) as Array<{ state: string; kind: string }>;
        const row = rows[0];
        if (cancelled) return;
        if (!row || row.state === 'finished' || row.state === 'abandoned') {
          clearActiveBattle();
          setReconnectChecked(true);
          return;
        }
        if (row.state === 'lobby' && entry.code) {
          setPhase({
            kind: 'lobby',
            battleId: entry.battle_id,
            code: entry.code,
            isHost: entry.isHost,
          });
        } else if (row.state === 'starting' || row.state === 'active') {
          // Token was tied to the prior session; bounce through joining
          // to mint a fresh one and resync started_at.
          setPhase({ kind: 'joining', battleId: entry.battle_id });
        }
      } catch {
        // Network blip — fall back to a clean mode-select.
        clearActiveBattle();
      } finally {
        if (!cancelled) setReconnectChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // Persist / clear the active-battle entry as the phase changes. We
  // record the battle on lobby + active entry; clear on mode-select +
  // finished. Other transient phases inherit the previous record.
  useEffect(() => {
    if (phase.kind === 'lobby') {
      writeActiveBattle({
        battle_id: phase.battleId,
        code: phase.code,
        isHost: phase.isHost,
      });
    } else if (phase.kind === 'active') {
      writeActiveBattle({
        battle_id: phase.battleId,
        isHost: false,
      });
    } else if (phase.kind === 'mode-select' || phase.kind === 'finished') {
      clearActiveBattle();
    }
  }, [phase]);

  if (loading || !reconnectChecked) {
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
        <AuthModal
          open
          onClose={() => router.push('/')}
          next="/mog"
          context="to battle"
        />
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
        onRematch={(battleId, code, isHost) =>
          setPhase({ kind: 'lobby', battleId, code, isHost })
        }
      />
    );
  }

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader authNext="/mog" />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        <div className="mb-4 flex items-center gap-2">
          <BackButton onBack={() => setPhase({ kind: 'mode-select' })} />
          <h1 className="text-2xl font-bold text-white">mog battles</h1>
        </div>

        {phase.kind === 'mode-select' && (
          <ModeSelect
            onQueue={() => setPhase({ kind: 'queueing' })}
            onPaired={(battleId) =>
              setPhase({ kind: 'joining', battleId })
            }
            onCreate={() => setPhase({ kind: 'creating' })}
            onJoin={() => setPhase({ kind: 'join-input' })}
          />
        )}

        {phase.kind === 'creating' && (
          <Creating
            onCreated={(battleId, code) =>
              setPhase({ kind: 'lobby', battleId, code, isHost: true })
            }
            onError={() => setPhase({ kind: 'mode-select' })}
          />
        )}

        {phase.kind === 'join-input' && (
          <JoinInput
            onSubmit={(code) => setPhase({ kind: 'join-loading', code })}
            onCancel={() => setPhase({ kind: 'mode-select' })}
          />
        )}

        {phase.kind === 'join-loading' && (
          <Joining_PrivateLoader
            code={phase.code}
            onJoined={(battleId) =>
              setPhase({ kind: 'lobby', battleId, code: phase.code, isHost: false })
            }
            onError={() => setPhase({ kind: 'join-input' })}
          />
        )}

        {phase.kind === 'lobby' && (
          <Lobby
            userId={user.id}
            battleId={phase.battleId}
            code={phase.code}
            isHost={phase.isHost}
            onLeave={() => setPhase({ kind: 'mode-select' })}
            onStarting={() =>
              setPhase({ kind: 'joining', battleId: phase.battleId })
            }
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

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Link
      href="/"
      onClick={(e) => {
        e.preventDefault();
        onBack();
      }}
      aria-label="Back home"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
    >
      <ArrowLeft size={18} />
    </Link>
  );
}

// ---- Mode select -----------------------------------------------------------

function ModeSelect({
  onQueue,
  onPaired,
  onCreate,
  onJoin,
}: {
  onQueue: () => void;
  onPaired: (battleId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const findBattle = useCallback(async () => {
    onQueue();
    try {
      const res = await fetch('/api/battle/queue', { method: 'POST' });
      const data = (await res.json()) as {
        battle_id?: string;
        paired?: boolean;
      };
      if (data.battle_id && data.paired) {
        onPaired(data.battle_id);
      }
      // Otherwise (queued: true), Queueing's realtime + polling pairs us.
    } catch {
      // Queueing component keeps polling.
    }
  }, [onQueue, onPaired]);

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
          <span className="text-sm text-zinc-200">
            1v1 against a stranger · ~15s including matchmaking
          </span>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCreate}
          style={{ touchAction: 'manipulation' }}
          className="group relative flex flex-col gap-2 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-left transition-all hover:border-white/25 hover:bg-white/[0.05]"
        >
          <Users size={20} className="text-white" aria-hidden />
          <span className="text-base font-semibold text-white">create party</span>
          <span className="text-xs text-zinc-400">share a code · up to 10</span>
        </button>
        <button
          type="button"
          onClick={onJoin}
          style={{ touchAction: 'manipulation' }}
          className="group relative flex flex-col gap-2 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-left transition-all hover:border-white/25 hover:bg-white/[0.05]"
        >
          <Swords size={20} className="text-white" aria-hidden />
          <span className="text-base font-semibold text-white">join party</span>
          <span className="text-xs text-zinc-400">enter a 6-char code</span>
        </button>
      </div>
    </div>
  );
}

// ---- Create ----------------------------------------------------------------

function Creating({
  onCreated,
  onError,
}: {
  onCreated: (battleId: string, code: string) => void;
  onError: () => void;
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/battle/create', { method: 'POST' });
        if (!res.ok) {
          onError();
          return;
        }
        const data = (await res.json()) as { battle_id: string; code: string };
        onCreated(data.battle_id, data.code);
      } catch {
        onError();
      }
    })();
  }, [onCreated, onError]);

  return (
    <CenteredSpinner label="creating party…" />
  );
}

// ---- Join input ------------------------------------------------------------

function JoinInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState('');
  const code = normaliseBattleCode(raw);
  const valid = isValidBattleCode(code);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(code);
      }}
      className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="party-code"
          className="text-xs uppercase tracking-[0.16em] text-zinc-500"
        >
          party code
        </label>
        <input
          id="party-code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          maxLength={BATTLE_CODE_LENGTH + 2}
          placeholder="e.g. K7M2P9"
          className="font-num w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-2xl font-bold tracking-[0.3em] text-white placeholder:text-zinc-700 focus:border-white/30 focus:outline-none"
          style={{ textTransform: 'uppercase' }}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          style={{ touchAction: 'manipulation' }}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={!valid}
          style={{ touchAction: 'manipulation' }}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          join
        </button>
      </div>
    </form>
  );
}

function Joining_PrivateLoader({
  code,
  onJoined,
  onError,
}: {
  code: string;
  onJoined: (battleId: string) => void;
  onError: () => void;
}) {
  const firedRef = useRef(false);
  const [errMessage, setErrMessage] = useState<string | null>(null);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/battle/join', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setErrMessage(data.error ?? 'could not join');
          window.setTimeout(onError, 1200);
          return;
        }
        const data = (await res.json()) as { battle_id: string };
        onJoined(data.battle_id);
      } catch {
        setErrMessage('could not join');
        window.setTimeout(onError, 1200);
      }
    })();
  }, [code, onJoined, onError]);

  if (errMessage) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        {prettyJoinError(errMessage)}
      </div>
    );
  }
  return <CenteredSpinner label="joining party…" />;
}

function prettyJoinError(code: string): string {
  switch (code) {
    case 'code_not_found':
      return 'no party with that code.';
    case 'battle_already_started':
      return 'this party already started.';
    case 'battle_full':
      return 'this party is full (10 max).';
    case 'invalid_code':
      return 'codes are 6 letters/numbers (no I/L/O/U).';
    default:
      return 'could not join — try again.';
  }
}

// ---- Lobby -----------------------------------------------------------------

type LobbyParticipant = {
  user_id: string;
  display_name: string;
};

function Lobby({
  userId,
  battleId,
  code,
  isHost,
  onLeave,
  onStarting,
}: {
  userId: string;
  battleId: string;
  code: string;
  isHost: boolean;
  onLeave: () => void;
  onStarting: () => void;
}) {
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const supabaseRest = useMemo(
    () => ({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    }),
    [],
  );

  const refetchParticipants = useCallback(async () => {
    if (!supabaseRest.url) return;
    try {
      const res = await fetch(
        `${supabaseRest.url}/rest/v1/battle_participants?battle_id=eq.${battleId}&select=user_id,display_name&order=joined_at.asc`,
        {
          headers: {
            apikey: supabaseRest.key,
            Authorization: `Bearer ${supabaseRest.key}`,
          },
        },
      );
      if (!res.ok) return;
      const rows = (await res.json()) as LobbyParticipant[];
      setParticipants(rows);
    } catch {
      // ignore
    }
  }, [battleId, supabaseRest]);

  // Initial + periodic refresh.
  useEffect(() => {
    void refetchParticipants();
    const id = window.setInterval(refetchParticipants, 4000);
    return () => window.clearInterval(id);
  }, [refetchParticipants]);

  // Realtime: participants joining/leaving + battle row state changes.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`lobby:${battleId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'battle_participants',
          filter: `battle_id=eq.${battleId}`,
        },
        () => {
          void refetchParticipants();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'battles',
          filter: `id=eq.${battleId}`,
        },
        (payload: { new: { state?: string } }) => {
          if (payload.new.state === 'starting' || payload.new.state === 'active') {
            onStarting();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [battleId, refetchParticipants, onStarting]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [code]);

  const onStart = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch('/api/battle/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ battle_id: battleId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStartError(prettyStartError(data.error));
        setStarting(false);
        return;
      }
      // The realtime subscription on battles.state will flip us into joining.
    } catch {
      setStartError('could not start — try again.');
      setStarting(false);
    }
  }, [battleId]);

  const canStart = isHost && participants.length >= 2 && !starting;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
          party code
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-num text-4xl font-extrabold tracking-[0.3em] text-white">
            {code}
          </span>
          <button
            type="button"
            onClick={onCopy}
            aria-label="copy code"
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.1]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          share this code with friends. up to 10 players.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            in lobby · {participants.length}/10
          </span>
          {participants.length < 2 && (
            <span className="text-[10px] uppercase tracking-[0.16em] text-amber-400">
              need ≥ 2 to start
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-1.5">
          {participants.map((p) => (
            <li
              key={p.user_id}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
            >
              <span className="text-white">{p.display_name}</span>
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {p.user_id === userId && <span>you</span>}
                {/* host indicator: first joiner is the host (insert order) */}
              </span>
            </li>
          ))}
          {participants.length === 0 && (
            <li className="text-xs text-zinc-500">loading participants…</li>
          )}
        </ul>
      </div>

      {startError && (
        <p className="text-xs text-red-300">{startError}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLeave}
          style={{ touchAction: 'manipulation' }}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
        >
          leave
        </button>
        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> starting…
              </>
            ) : (
              'start battle'
            )}
          </button>
        ) : (
          <div className="inline-flex h-11 flex-[2] items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-sm text-zinc-400">
            waiting for host…
          </div>
        )}
      </div>
    </div>
  );
}

function prettyStartError(code: string | undefined): string {
  switch (code) {
    case 'not_enough_participants':
      return 'need at least 2 players to start.';
    case 'unstartable_state':
      return 'this party already started.';
    case 'not_host':
      return 'only the host can start.';
    default:
      return 'could not start — try again.';
  }
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

  return <CenteredSpinner label="opponent found · joining…" iconClassName="text-emerald-400" />;
}

function CenteredSpinner({
  label,
  iconClassName,
}: {
  label: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      >
        <Swords
          size={32}
          className={iconClassName ?? 'text-zinc-400'}
          aria-hidden
        />
      </motion.div>
      <p className="text-sm text-white">{label}</p>
    </div>
  );
}

// ---- Result screen ---------------------------------------------------------

function ResultScreen({
  result,
  currentUserId,
  onAgain,
  onRematch,
}: {
  result: FinishPayload;
  currentUserId: string;
  onAgain: () => void;
  onRematch: (battleId: string, code: string, isHost: boolean) => void;
}) {
  const me = result.participants.find((p) => p.user_id === currentUserId);
  const opponent = result.participants.find((p) => p.user_id !== currentUserId);
  const youWon = me?.is_winner === true;
  const isPrivate = result.kind === 'private';
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  // Listen for the OTHER participant clicking rematch first. When the
  // server inserts the new private battle it broadcasts battle.rematch
  // on the OLD battle's channel; we hop into the new lobby as a joiner.
  useEffect(() => {
    if (!isPrivate) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`battle:${result.battle_id}`)
      .on(
        'broadcast',
        { event: 'battle.rematch' },
        (msg: {
          payload: { new_battle_id?: string; new_code?: string };
        }) => {
          const id = msg.payload.new_battle_id;
          const code = msg.payload.new_code;
          if (typeof id === 'string' && typeof code === 'string') {
            onRematch(id, code, false);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isPrivate, result.battle_id, onRematch]);

  const [sharing, setSharing] = useState(false);

  const onShare = useCallback(async () => {
    if (!me || !opponent) return;
    setSharing(true);
    try {
      const blob = await generateBattleShareImage({
        self: { display_name: me.display_name, peak_score: me.final_score },
        opponent: {
          display_name: opponent.display_name,
          peak_score: opponent.final_score,
        },
        won: youWon,
      });
      const filename = `holymog-${youWon ? 'win' : 'loss'}-${Date.now()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // On mobile, Web Share API with files lets the user pick IG /
      // Snap / X / etc. directly. On desktop or unsupported clients,
      // fall back to a download.
      const navWithShare = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (
        typeof navWithShare.canShare === 'function' &&
        typeof navWithShare.share === 'function' &&
        navWithShare.canShare({ files: [file] })
      ) {
        await navWithShare.share({
          files: [file],
          title: 'holymog battle',
          text: youWon ? 'i mogged' : 'i got mogged',
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // best-effort; no error UI for now
    } finally {
      setSharing(false);
    }
  }, [me, opponent, youWon]);

  const startRematch = useCallback(async () => {
    setRematching(true);
    setRematchError(null);
    try {
      const res = await fetch('/api/battle/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle_id: result.battle_id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRematchError(data.error ?? 'rematch failed');
        setRematching(false);
        return;
      }
      const data = (await res.json()) as { battle_id: string; code: string };
      onRematch(data.battle_id, data.code, true);
    } catch {
      setRematchError('network error');
      setRematching(false);
    }
  }, [result.battle_id, onRematch]);

  return (
    <div className="min-h-dvh bg-black">
      {/* Winner flash overlay — only when the local user won. Brief 0.5s
          emerald wash that fades out, drawing the eye to the headline. */}
      <AnimatePresence>
        {youWon && (
          <motion.div
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-0 z-50"
            style={{
              background:
                'radial-gradient(circle at center, rgba(16,185,129,0.35) 0%, rgba(0,0,0,0) 65%)',
            }}
          />
        )}
      </AnimatePresence>

      <AppHeader authNext="/mog" />
      <main
        className="mx-auto w-full max-w-md px-5 py-8"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
        <motion.h1
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-1 text-3xl font-bold text-white"
        >
          {youWon ? 'you mogged' : me ? 'you got mogged' : 'battle done'}
        </motion.h1>
        <motion.p
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
          className="mb-6 text-sm text-zinc-400"
        >
          {youWon
            ? 'highest peak score wins. nice.'
            : me
              ? 'rematch in the next one'
              : 'thanks for spectating'}
        </motion.p>

        <div className="mb-6 grid grid-cols-2 gap-3">
          {me && <ResultCell entry={me} you />}
          {opponent && <ResultCell entry={opponent} />}
        </div>

        {me && opponent && (
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            style={{ touchAction: 'manipulation' }}
            className="mb-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sharing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> rendering image…
              </>
            ) : (
              <>
                <Download size={14} aria-hidden /> share result
              </>
            )}
          </button>
        )}

        {rematchError && (
          <p className="mb-2 text-xs text-red-300">{rematchError}</p>
        )}

        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
          >
            home
          </Link>
          {isPrivate ? (
            <button
              type="button"
              onClick={startRematch}
              disabled={rematching}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rematching ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> rematching…
                </>
              ) : (
                'rematch'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAgain}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100"
            >
              find another
            </button>
          )}
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
    <motion.div
      initial={{ y: 14, scale: 0.95, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
        delay: you ? 0.12 : 0.22,
      }}
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
    </motion.div>
  );
}
