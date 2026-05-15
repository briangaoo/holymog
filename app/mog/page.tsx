'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Search,
  Share2,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { AvatarFallback } from '@/components/AvatarFallback';
import { Frame } from '@/components/customization/Frame';
import { Badge } from '@/components/customization/Badge';
import { NameFx } from '@/components/customization/NameFx';
import type { UserStats } from '@/lib/customization';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  BATTLE_CODE_ALPHABET,
  BATTLE_CODE_LENGTH,
  isValidBattleCode,
} from '@/lib/battle-code';
import {
  clearActiveBattle,
  readActiveBattle,
  writeActiveBattle,
} from '@/lib/activeBattle';
import { MogResultScreen } from '@/components/MogResultScreen';
import {
  BattleConsentModal,
  readBattleConsent,
  writeBattleConsent,
} from '@/components/BattleConsentModal';
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
  /** True when the top two participants tied on peak score. winner_id
   *  will be null. UI should render a grey "TIE" state instead of
   *  picking one player as the winner. */
  is_tie?: boolean;
  participants: Array<{
    user_id: string;
    display_name: string;
    final_score: number;
    is_winner: boolean;
    is_tie?: boolean;
  }>;
  /** Per-user ELO delta from this battle. Empty for private battles or
   *  for ties that didn't change ratings. */
  elo_changes?: Array<{
    user_id: string;
    before: number;
    after: number;
    delta: number;
  }>;
};

export default function MogPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'mode-select' });
  // Until reconnection check resolves we don't want to render mode-select
  // for a split second (would flash before navigating into the lobby).
  const [reconnectChecked, setReconnectChecked] = useState(false);

  // Battle consent gate. First-time visitors see the modal before any
  // entry action goes through (create-party, join-party, find-a-battle).
  // localStorage flag persists per device — same posture as the scan
  // privacy modal.
  const [consented, setConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  useEffect(() => {
    setConsented(readBattleConsent());
    setConsentChecked(true);
  }, []);
  const guardConsent = useCallback(
    (action: () => void) => {
      if (consented) {
        action();
      } else {
        // Stash the action; replay after the user accepts.
        setPendingAction(() => action);
      }
    },
    [consented],
  );
  const acknowledgeConsent = useCallback(() => {
    writeBattleConsent();
    setConsented(true);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

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
        // Backend route — Supabase REST + anon key is blocked by RLS
        // (auth.uid() doesn't propagate from Auth.js sessions).
        const res = await fetch(`/api/battle/${entry.battle_id}/state`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!res.ok) {
          clearActiveBattle();
          setReconnectChecked(true);
          return;
        }
        const row = (await res.json()) as { state: string; kind: string };
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

  // Back button: from mode-select, navigate home. From any sub-phase,
  // reset back to mode-select (cancels lobby / queue / join flow).
  // Defined here (above early returns) so the hook order stays stable.
  const onBack = useCallback(() => {
    if (phase.kind === 'mode-select') {
      router.push('/');
      return;
    }
    setPhase({ kind: 'mode-select' });
  }, [phase.kind, router]);

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
      <MogResultScreen
        result={phase.result}
        currentUserId={user.id}
        onFindAnother={() => setPhase({ kind: 'mode-select' })}
        onRematch={(battleId, code, isHost) =>
          setPhase({ kind: 'lobby', battleId, code, isHost })
        }
      />
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      <AppHeader authNext="/mog" />
      <main className="relative mx-auto w-full max-w-md px-5 py-6 sm:max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <BackButton onBack={onBack} />
          <h1 className="text-2xl font-bold uppercase tracking-tight text-white">
            MOG BATTLES
          </h1>
        </div>

        {phase.kind === 'mode-select' && (
          <>
            <ModeSelect
              onCreate={() =>
                guardConsent(() => setPhase({ kind: 'creating' }))
              }
              onJoin={() =>
                guardConsent(() => setPhase({ kind: 'join-input' }))
              }
              guardConsent={guardConsent}
            />
            <BattleStats />
          </>
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

      {/* Battle consent gate. Open when the user has clicked a battle
          entry action without having previously accepted on this
          device. The pending action replays after `acknowledgeConsent`
          and `pendingAction` is cleared; if the user navigates away
          mid-modal the state resets on next mount. */}
      <BattleConsentModal
        open={consentChecked && !consented && pendingAction !== null}
        onAcknowledge={acknowledgeConsent}
      />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back"
      style={{ touchAction: 'manipulation' }}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
    >
      <ArrowLeft size={16} />
    </button>
  );
}

// ---- Mode select -----------------------------------------------------------

function ModeSelect({
  onCreate,
  onJoin,
  guardConsent,
}: {
  onCreate: () => void;
  onJoin: () => void;
  guardConsent: (action: () => void) => void;
}) {
  const router = useRouter();
  // Public matchmaking is its own full-screen route. We navigate so the
  // experience can take over the entire viewport (no AppHeader, no
  // page chrome) and own its own browser-history entry. Gate the
  // navigation behind the consent modal so first-time users see the
  // popup before the camera ever opens.
  const findBattle = useCallback(() => {
    guardConsent(() => router.push('/mog/battle'));
  }, [router, guardConsent]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero "find a battle" — brutalist square with hard white border,
          no glow, uppercase. */}
      <button
        type="button"
        onClick={findBattle}
        style={{ touchAction: 'manipulation', borderRadius: 2 }}
        className="group relative flex w-full flex-col border-2 border-white/40 bg-black p-7 text-left transition-colors hover:border-white hover:bg-white/[0.03]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                <span className="relative h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                RANKED · LIVE
              </span>
            </div>
            <Swords size={36} aria-hidden className="text-white" />
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-bold uppercase leading-none tracking-tight text-white">
                FIND A BATTLE
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-white/70">
                1V1 AGAINST A STRANGER · ~15S INCL. MATCHMAKING
              </span>
            </div>
          </div>
          <ArrowRight
            size={20}
            aria-hidden
            className="mt-1 text-white/70 transition-transform group-hover:translate-x-1"
          />
        </div>
      </button>

      {/* Section divider — small label so the parties block reads as
          "alternative" and the hero clearly dominates. */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
          OR PLAY WITH FRIENDS
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/15" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCreate}
          style={{ touchAction: 'manipulation', borderRadius: 2 }}
          className="group flex w-full flex-col gap-2.5 border-2 border-white/30 bg-black p-5 text-left transition-colors hover:border-white hover:bg-white/[0.03]"
        >
          <Users size={20} aria-hidden className="text-white" />
          <span className="text-base font-bold uppercase tracking-tight text-white">
            CREATE PARTY
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            SHARE A CODE · UP TO 10
          </span>
        </button>

        <button
          type="button"
          onClick={onJoin}
          style={{ touchAction: 'manipulation', borderRadius: 2 }}
          className="group flex w-full flex-col gap-2.5 border-2 border-white/30 bg-black p-5 text-left transition-colors hover:border-white hover:bg-white/[0.03]"
        >
          <Search size={20} aria-hidden className="text-white" />
          <span className="text-base font-bold uppercase tracking-tight text-white">
            JOIN PARTY
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            ENTER A 6-CHAR CODE
          </span>
        </button>
      </div>
    </div>
  );
}

// ---- Battle stats panel ----------------------------------------------------

type ProfileStats = {
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  matches_tied: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
};

type RecentBattle = {
  battle_id: string;
  is_winner: boolean;
  is_tie?: boolean;
  peak_score: number;
  finished_at: string | null;
};

const RECENT_RIBBON_LENGTH = 10;

/**
 * Personal battle stats — shown below the mode-select cards. Pulls
 * `/api/account/me` and `/api/account/history?page=1` in parallel.
 * Renders a 6-cell stat grid plus a recent W/L ribbon (most recent on
 * the right). Pre-battle users see "play your first battle" copy
 * instead of an awkward "0W·0L".
 */
function BattleStats() {
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [recent, setRecent] = useState<RecentBattle[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, histRes] = await Promise.all([
          fetch('/api/account/me', { cache: 'no-store' }),
          fetch('/api/account/history?page=1', { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (meRes.ok) {
          const data = (await meRes.json()) as { profile: ProfileStats | null };
          setProfile(data.profile);
        }
        if (histRes.ok) {
          const data = (await histRes.json()) as { entries?: RecentBattle[] };
          setRecent((data.entries ?? []).slice(0, RECENT_RIBBON_LENGTH));
        }
      } catch {
        // best-effort; show empty stats
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <section className="mt-6 border-2 border-white/20 bg-black p-5" style={{ borderRadius: 2 }}>
        <div className="h-3 w-24 rounded bg-white/[0.06]" />
        <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-2 w-12 rounded bg-white/[0.05]" />
              <div className="h-6 w-16 rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!profile) {
    return null;
  }

  const ties = profile.matches_tied ?? 0;
  const losses = profile.matches_played - profile.matches_won - ties;
  // Win-rate excludes ties from the denominator — feels right since a
  // tie is neither a win nor a loss.
  const ratedMatches = profile.matches_played - ties;
  const winRate =
    ratedMatches > 0
      ? Math.round((profile.matches_won / ratedMatches) * 100)
      : null;
  const eloDelta = profile.elo - profile.peak_elo;
  const unranked = profile.matches_played === 0;
  const streakHot = profile.current_streak >= 3;

  return (
    <section className="mt-6 overflow-hidden border-2 border-white/20 bg-black p-5" style={{ borderRadius: 2 }}>
      <header className="mb-5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
          YOUR BATTLES
        </span>
        {unranked ? (
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">
            UNRANKED
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">
            {profile.matches_played} PLAYED
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-x-4 gap-y-5">
        <Stat
          label="ELO"
          valueClass="text-sky-300"
          value={profile.elo}
          sub={
            eloDelta < 0 ? (
              <span className="text-rose-300">{eloDelta}</span>
            ) : eloDelta > 0 ? (
              <span className="text-emerald-300">+{eloDelta}</span>
            ) : null
          }
        />
        <Stat
          label="PEAK"
          valueClass="text-violet-300"
          value={profile.peak_elo}
        />
        <Stat
          label="STREAK"
          valueClass={streakHot ? 'text-emerald-300' : 'text-white'}
          value={
            <>
              {profile.current_streak}
              {streakHot && <span className="ml-1">🔥</span>}
            </>
          }
          sub={
            profile.longest_streak > 0
              ? `LONGEST ${profile.longest_streak}`
              : null
          }
        />
        <Stat
          label="RECORD"
          value={
            unranked ? (
              <span className="text-white/30">—</span>
            ) : ties > 0 ? (
              <>
                <span className="text-emerald-300">{profile.matches_won}</span>
                <span className="uppercase text-zinc-500">W · </span>
                <span className="text-zinc-300">{ties}</span>
                <span className="uppercase text-zinc-500">T · </span>
                <span className="text-rose-300">{losses}</span>
                <span className="uppercase text-zinc-500">L</span>
              </>
            ) : (
              <>
                <span className="text-emerald-300">{profile.matches_won}</span>
                <span className="uppercase text-zinc-500">W · </span>
                <span className="text-rose-300">{losses}</span>
                <span className="uppercase text-zinc-500">L</span>
              </>
            )
          }
        />
        <Stat
          label="WIN RATE"
          valueClass={
            winRate !== null && winRate >= 50
              ? 'text-emerald-300'
              : winRate !== null
                ? 'text-rose-300'
                : undefined
          }
          value={winRate !== null ? `${winRate}%` : <span className="text-white/30">—</span>}
        />
        <Stat
          label="BEST SCAN"
          valueClass="text-amber-300"
          value={
            profile.best_scan_overall === null ? (
              <span className="text-white/30">—</span>
            ) : (
              profile.best_scan_overall
            )
          }
        />
      </div>

      {/* Recent W/L ribbon — wins white, losses dim grey, ties mid grey.
          Red kept ONLY for genuine danger states (errors, F-tier); a
          ranked loss isn't dangerous, just dim. */}
      {recent.length > 0 && (
        <div className="mt-5 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">
            RECENT
          </span>
          <div className="flex gap-1">
            {Array.from({ length: RECENT_RIBBON_LENGTH - recent.length }).map(
              (_, i) => (
                <span
                  key={`empty-${i}`}
                  aria-hidden
                  className="h-2 w-5 bg-white/[0.06]"
                  style={{ borderRadius: 1 }}
                />
              ),
            )}
            {[...recent].reverse().map((r) => {
              const tied = r.is_tie === true;
              const label = tied ? 'tie' : r.is_winner ? 'win' : 'loss';
              const cls = tied
                ? 'bg-zinc-400'
                : r.is_winner
                  ? 'bg-emerald-400'
                  : 'bg-rose-500/80';
              return (
                <span
                  key={r.battle_id}
                  aria-label={label}
                  className={`h-2 w-5 ${cls}`}
                  style={{ borderRadius: 1 }}
                />
              );
            })}
          </div>
          <span
            aria-hidden
            className="ml-auto text-[10px] uppercase tracking-[0.22em] text-white/30"
          >
            NEW →
          </span>
        </div>
      )}

      {unranked && recent.length === 0 && (
        <p className="mt-4 border border-white/20 bg-white/[0.03] px-3 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white/70" style={{ borderRadius: 2 }}>
          PLAY YOUR FIRST BATTLE TO START RANKING. YOU&apos;RE PLACED
          PROVISIONALLY FOR YOUR FIRST 30 MATCHES (K=32) BEFORE SETTLING.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Optional Tailwind class for the value text (e.g. text-sky-300).
   *  Defaults to text-white when omitted. */
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <span
        className={`font-num text-2xl font-extrabold tabular-nums leading-none ${
          valueClass ?? 'text-white'
        }`}
      >
        {value}
      </span>
      {sub && (
        <span className="font-num text-[10px] uppercase tracking-[0.14em] tabular-nums text-white/40">
          {sub}
        </span>
      )}
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

/**
 * Kahoot-style code entry. Six independent character cells with
 * auto-advance focus, paste-distribution across cells, and
 * auto-submit when the last cell fills. Each cell rejects characters
 * not in the Crockford-uppercase alphabet so the user can't enter
 * I/L/O/U or other ambiguous glyphs.
 */
function JoinInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [cells, setCells] = useState<string[]>(() =>
    Array(BATTLE_CODE_LENGTH).fill(''),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const code = cells.join('');
  const valid = isValidBattleCode(code);

  // Focus the first cell on mount. Mobile keyboards open automatically.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const sanitizeChar = (c: string): string => {
    const u = c.toUpperCase();
    return BATTLE_CODE_ALPHABET.includes(u) ? u : '';
  };

  const setCellAt = useCallback(
    (idx: number, value: string) => {
      setCells((prev) => {
        const next = [...prev];
        next[idx] = value;
        return next;
      });
    },
    [],
  );

  // Distribute a pasted/typed string across the cells starting at idx.
  // Returns the final cursor index so the caller can refocus correctly.
  const writeFromIndex = useCallback(
    (idx: number, source: string): number => {
      const sanitized = source
        .toUpperCase()
        .split('')
        .map(sanitizeChar)
        .filter(Boolean);
      if (sanitized.length === 0) return idx;
      setCells((prev) => {
        const next = [...prev];
        for (let i = 0; i < sanitized.length && idx + i < BATTLE_CODE_LENGTH; i++) {
          next[idx + i] = sanitized[i];
        }
        return next;
      });
      return Math.min(idx + sanitized.length, BATTLE_CODE_LENGTH - 1);
    },
    [],
  );

  const handleChange = (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value;
    // Strip leading already-filled char so typing replaces, not appends.
    // (Some mobile autofills can send multi-char strings into a single
    // cell — we treat that as a paste and spread it across cells.)
    const newChars = raw.slice(cells[idx].length || 0);
    if (newChars.length > 1) {
      const newIdx = writeFromIndex(idx, newChars);
      inputRefs.current[newIdx]?.focus();
      inputRefs.current[newIdx]?.select();
      return;
    }
    const ch = sanitizeChar(newChars || raw.slice(-1));
    setCellAt(idx, ch);
    if (ch && idx < BATTLE_CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
      inputRefs.current[idx + 1]?.select();
    }
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace') {
      if (cells[idx]) {
        // Clear this cell first; second backspace then moves left.
        setCellAt(idx, '');
        return;
      }
      if (idx > 0) {
        e.preventDefault();
        setCellAt(idx - 1, '');
        inputRefs.current[idx - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
      inputRefs.current[idx - 1]?.select();
    } else if (e.key === 'ArrowRight' && idx < BATTLE_CODE_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
      inputRefs.current[idx + 1]?.select();
    } else if (e.key === 'Enter' && valid) {
      e.preventDefault();
      onSubmit(code);
    }
  };

  const handlePaste = (
    idx: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const newIdx = writeFromIndex(idx, text);
    inputRefs.current[newIdx]?.focus();
    inputRefs.current[newIdx]?.select();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(code);
      }}
      className="flex flex-col gap-5"
    >
      <div className="relative flex flex-col items-center gap-6 border-2 border-white/20 bg-black px-5 py-9" style={{ borderRadius: 2 }}>
        <div className="flex flex-col items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 border border-white/30 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white" style={{ borderRadius: 2 }}>
            <Search size={11} aria-hidden /> ENTER CODE
          </span>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            6 CHARACTERS · SENT BY YOUR HOST
          </p>
        </div>

        <div
          className="flex items-center justify-center gap-2 sm:gap-2.5"
          role="group"
          aria-label="party code"
        >
          {cells.map((ch, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="text"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={BATTLE_CODE_LENGTH}
              value={ch}
              onChange={(e) => handleChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={(e) => handlePaste(idx, e)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`code character ${idx + 1}`}
              className={`font-num h-14 w-11 border-2 bg-black text-center text-3xl font-extrabold uppercase tabular-nums text-white caret-transparent transition-colors sm:h-16 sm:w-12 sm:text-[2rem] ${
                ch
                  ? 'border-white'
                  : 'border-white/25 hover:border-white/50 focus:border-white'
              } focus:outline-none`}
              style={{ textTransform: 'uppercase', borderRadius: 2 }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          style={{ touchAction: 'manipulation', borderRadius: 2 }}
          className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={!valid}
          style={{ touchAction: 'manipulation', borderRadius: 2 }}
          className="inline-flex h-11 flex-[2] items-center justify-center gap-2 bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {valid ? (
            <>
              JOIN PARTY <ArrowRight size={14} aria-hidden />
            </>
          ) : (
            'JOIN PARTY'
          )}
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
      <div className="border-2 border-red-500/40 bg-red-500/[0.06] p-6 text-sm uppercase tracking-[0.14em] text-red-200" style={{ borderRadius: 2 }}>
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
  avatar_url?: string | null;
  equipped_frame?: string | null;
  equipped_flair?: string | null;
  equipped_name_fx?: string | null;
  /** userStats fields — smart cosmetics (callout, streak-pyre, etc.)
   *  derive what they render from these so the lobby looks identical
   *  to every other surface that shows the same user. */
  elo?: number | null;
  current_streak?: number | null;
  matches_won?: number | null;
  best_scan_overall?: number | null;
  is_subscriber?: boolean;
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

  // Set to true the instant we know the battle is transitioning into
  // the joining/active phase (host clicked start OR poll detected the
  // state change). The unmount cleanup below uses this to distinguish
  // "user navigated away from the lobby" (auto-leave the party) from
  // "battle is starting normally" (don't auto-leave — they're about
  // to be a participant in the active battle).
  const startingRef = useRef(false);
  const safeOnStarting = useCallback(() => {
    startingRef.current = true;
    onStarting();
  }, [onStarting]);

  // Auto-leave on navigate-away. Without this, a guest who closes the
  // tab or wanders back to holymog.com still shows in the host's lobby
  // + counts toward min-2-to-start, so the host can unintentionally
  // start a battle with a ghost. The /api/battle/leave route only
  // marks left_at; participants/start/join all filter that out so the
  // ghost is invisible to lobby logic. If the guest comes back via
  // the same code, /api/battle/join clears left_at to re-activate.
  //
  // sendBeacon (vs fetch) is essential — fetch initiated during page
  // navigation gets cancelled by every browser; sendBeacon is
  // explicitly designed to land at unload/cleanup time.
  useEffect(() => {
    const sendLeave = () => {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        '/api/battle/leave',
        new Blob([JSON.stringify({ battle_id: battleId })], {
          type: 'application/json',
        }),
      );
    };
    // Tab close / refresh — always fire, even if the battle is starting.
    // The route is idempotent + the start path captures the participant
    // list before anyone could close their tab.
    window.addEventListener('beforeunload', sendLeave);
    return () => {
      window.removeEventListener('beforeunload', sendLeave);
      // SPA unmount — explicit LEAVE click, parent re-key, or
      // navigation away from /mog. Skip when the battle is starting:
      // the user is about to be a participant in BattleRoom and we
      // don't want to mark them left right as their tile mounts.
      if (startingRef.current) return;
      sendLeave();
    };
  }, [battleId]);

  const refetchParticipants = useCallback(async () => {
    try {
      // Backend route — RLS on battle_participants requires auth.uid()
      // which Auth.js doesn't set, so the Supabase REST + anon-key path
      // returns 0 rows for every client. Service-role on the server
      // bypasses RLS and we apply our own "must be a participant or
      // host" check inside the route.
      const res = await fetch(`/api/battle/${battleId}/participants`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        participants?: LobbyParticipant[];
        state?: string;
      };
      if (Array.isArray(data.participants)) setParticipants(data.participants);
      // Polling fallback for the start transition: if Realtime is
      // degraded and the 'battle.starting' broadcast never reaches us,
      // detecting state != 'lobby' here flips us into the joining phase
      // so private parties can start without Realtime. Same poll cadence
      // (every 4s) — adds a worst-case 4s latency vs the broadcast but
      // guarantees the transition fires.
      if (
        typeof data.state === 'string' &&
        data.state !== 'lobby' &&
        data.state !== 'cancelled'
      ) {
        safeOnStarting();
      }
    } catch {
      // ignore
    }
  }, [battleId, safeOnStarting]);

  // Initial + periodic refresh — the broadcast subscription below is
  // the fast path, but polling is the reliable fallback in case
  // Realtime is unreachable for any client.
  useEffect(() => {
    void refetchParticipants();
    const id = window.setInterval(refetchParticipants, 4000);
    return () => window.clearInterval(id);
  }, [refetchParticipants]);

  // Realtime broadcast subscription. The server emits broadcast events
  // (lib/realtime.ts) on the `battle:${id}` topic when participants
  // join (/api/battle/join) and when the host starts the battle
  // (/api/battle/start). Broadcast channels don't go through RLS, so
  // this works regardless of Supabase Auth state.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`battle:${battleId}`)
      .on('broadcast', { event: 'participant.joined' }, () => {
        void refetchParticipants();
      })
      .on('broadcast', { event: 'battle.starting' }, () => {
        // Use safeOnStarting (not raw onStarting) so the unmount
        // cleanup below sees startingRef=true and skips the auto-
        // leave sendBeacon. Without this, a guest whose Realtime
        // delivered the broadcast first would leave their own
        // ghost row right as the battle started, and every other
        // tile would render a stale LEFT pill over their video.
        safeOnStarting();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [battleId, refetchParticipants, safeOnStarting]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [code]);

  // Native Share — only renders the button when the browser actually
  // exposes the Web Share API (mobile Safari, Chrome on Android,
  // recent desktop). When it's missing the Copy button is enough.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);
  const onShare = useCallback(async () => {
    try {
      await navigator.share({
        title: 'holymog party',
        text: `join my holymog party — code ${code}`,
      });
    } catch {
      // user cancelled / share unavailable — fall back to copy
      void onCopy();
    }
  }, [code, onCopy]);

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
      // Host self-transitions on a successful response instead of
      // waiting for the Realtime broadcast to echo back. Broadcasts
      // have proven flaky on this project; the response IS the signal
      // that the battle is starting, no reason to add a round-trip.
      // Guests pick up the transition via the participants-poll
      // fallback (refetchParticipants returns state on every tick).
      safeOnStarting();
    } catch {
      setStartError('could not start — try again.');
      setStarting(false);
    }
  }, [battleId, safeOnStarting]);

  const canStart = isHost && participants.length >= 2 && !starting;

  // Split the 6-char code into individual cells so the host's display
  // matches the join input — friends scanning their screen see the
  // same chunky visual rhythm in both directions.
  const cells = code.split('');

  return (
    <div className="flex flex-col gap-4">
      <div className="border-2 border-white/20 bg-black px-5 py-7" style={{ borderRadius: 2 }}>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex items-center gap-1.5 border border-white/30 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white" style={{ borderRadius: 2 }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            PARTY CODE
          </span>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
            SHARE WITH FRIENDS · UP TO 10 PLAYERS
          </p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          aria-label="copy code"
          style={{ touchAction: 'manipulation' }}
          className="group mt-5 flex w-full items-center justify-center gap-2 sm:gap-2.5"
        >
          {cells.map((ch, idx) => (
            <span
              key={idx}
              className="font-num inline-flex h-14 w-11 items-center justify-center border-2 border-white/40 bg-black text-3xl font-extrabold uppercase tabular-nums text-white transition-colors group-hover:border-white sm:h-16 sm:w-12 sm:text-[2rem]"
              style={{ textTransform: 'uppercase', borderRadius: 2 }}
            >
              {ch}
            </span>
          ))}
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            style={{ touchAction: 'manipulation', borderRadius: 2 }}
            className="inline-flex h-11 items-center gap-2 border-2 border-white/30 bg-black px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
          >
            {copied ? (
              <>
                <Check size={14} aria-hidden /> COPIED
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden /> COPY
              </>
            )}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={onShare}
              style={{ touchAction: 'manipulation', borderRadius: 2 }}
              className="inline-flex h-11 items-center gap-2 bg-white px-4 text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90"
            >
              <Share2 size={14} aria-hidden /> SHARE
            </button>
          )}
        </div>
      </div>

      <div className="border-2 border-white/20 bg-black p-5" style={{ borderRadius: 2 }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
            IN LOBBY · {participants.length}/10
          </span>
          {participants.length < 2 && (
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">
              NEED ≥ 2 TO START
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-1.5">
          {participants.map((p, idx) => {
            const isYou = p.user_id === userId;
            const isHostRow = idx === 0;
            const userStats: UserStats = {
              elo: p.elo ?? null,
              bestScanOverall: p.best_scan_overall ?? null,
              currentStreak: p.current_streak ?? null,
              currentWinStreak: p.current_streak ?? null,
              matchesWon: p.matches_won ?? null,
              weakestSubScore: null,
            };
            return (
              <motion.li
                key={p.user_id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 border border-white/15 bg-white/[0.02] px-3 py-2"
                style={{ borderRadius: 2 }}
              >
                <Frame
                  slug={p.equipped_frame ?? null}
                  size={32}
                  userStats={userStats}
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full overflow-hidden rounded-full border border-white/15">
                      <AvatarFallback
                        seed={p.display_name}
                        textClassName="text-[11px]"
                      />
                    </span>
                  )}
                </Frame>
                <Link
                  href={`/@${p.display_name}`}
                  className="flex-1 min-w-0 truncate text-sm text-white hover:underline underline-offset-2"
                >
                  <NameFx slug={p.equipped_name_fx ?? null} userStats={userStats}>
                    {p.display_name}
                  </NameFx>
                </Link>
                {p.equipped_flair && (
                  <Badge
                    slug={p.equipped_flair}
                    size={18}
                    userStats={userStats}
                  />
                )}
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/50">
                  {isHostRow && (
                    <span className="border border-white/30 bg-white/[0.06] px-1.5 py-0.5 text-white" style={{ borderRadius: 2 }}>
                      HOST
                    </span>
                  )}
                  {isYou && <span>YOU</span>}
                </span>
              </motion.li>
            );
          })}
          {participants.length > 0 && participants.length < 2 && (
            <li
              className="flex items-center gap-3 border border-dashed border-white/15 bg-white/[0.01] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/40"
              style={{ borderRadius: 2 }}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-white/15"
              >
                <Loader2 size={12} className="animate-spin text-white/40" />
              </span>
              WAITING FOR SOMEONE TO JOIN…
            </li>
          )}
          {participants.length === 0 && (
            <li className="text-[11px] uppercase tracking-[0.16em] text-white/40">LOADING PARTICIPANTS…</li>
          )}
        </ul>
      </div>

      {startError && (
        <p className="text-xs uppercase tracking-[0.14em] text-red-300">{startError}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLeave}
          style={{ touchAction: 'manipulation', borderRadius: 2 }}
          className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
        >
          LEAVE
        </button>
        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            style={{ touchAction: 'manipulation', borderRadius: 2 }}
            className="inline-flex h-11 flex-[2] items-center justify-center gap-2 bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {starting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> STARTING…
              </>
            ) : (
              'START BATTLE'
            )}
          </button>
        ) : (
          <div
            className="inline-flex h-11 flex-[2] items-center justify-center border-2 border-white/15 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white/40"
            style={{ borderRadius: 2 }}
          >
            WAITING FOR HOST…
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

// (Public matchmaking lives at /mog/battle as its own full-screen route.)


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
  // For 2-person battles the old "try once, drop to mode-select on
  // failure" path was usually fine — only one guest racing the
  // /api/battle/start broadcast. For 3+ guests, every non-host
  // races simultaneously, and any of:
  //   - /state lands before the host's UPDATE has committed
  //   - /token races LiveKit room creation
  //   - transient network hiccup on one of two parallel fetches
  // bounces THAT guest all the way back to mode-select while
  // everyone else lands in the battle. The retry pattern below
  // mirrors the public-matchmaking handoff (app/mog/battle/page.tsx)
  // — up to MAX_ATTEMPTS tries with a short backoff, then a
  // CONNECTION FAILED overlay with TRY AGAIN / GO BACK so the
  // user has agency instead of being silently kicked.
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAY_MS = 600;
  const [failed, setFailed] = useState(false);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);
  const successRef = useRef(false);

  const attempt = useCallback(async () => {
    if (cancelledRef.current || successRef.current) return;
    attemptRef.current += 1;
    try {
      const [tokenRes, stateRes] = await Promise.all([
        fetch(`/api/battle/${battleId}/token`, { cache: 'no-store' }),
        fetch(`/api/battle/${battleId}/state`, { cache: 'no-store' }),
      ]);
      if (!tokenRes.ok || !stateRes.ok) {
        throw new Error('handoff_failed');
      }
      const tokenData = (await tokenRes.json()) as { token: string; url: string };
      const stateData = (await stateRes.json()) as { started_at: string | null };
      const startedAt = stateData.started_at
        ? Date.parse(stateData.started_at)
        : Date.now();
      if (cancelledRef.current) return;
      successRef.current = true;
      onReady(tokenData.token, tokenData.url, startedAt);
    } catch {
      if (cancelledRef.current) return;
      if (attemptRef.current < MAX_ATTEMPTS) {
        // Brief backoff before the next retry — gives the host's
        // start broadcast / LiveKit room create a moment to settle.
        window.setTimeout(() => {
          if (!cancelledRef.current && !successRef.current) attempt();
        }, RETRY_DELAY_MS);
      } else {
        setFailed(true);
      }
    }
  }, [battleId, onReady]);

  useEffect(() => {
    cancelledRef.current = false;
    successRef.current = false;
    attemptRef.current = 0;
    setFailed(false);
    void attempt();
    return () => {
      cancelledRef.current = true;
    };
  }, [attempt]);

  const onTryAgain = useCallback(() => {
    attemptRef.current = 0;
    setFailed(false);
    void attempt();
  }, [attempt]);

  if (failed) {
    return (
      <div
        className="flex w-full max-w-sm flex-col gap-4 border-2 border-red-500/60 bg-black p-6 text-center"
        style={{ borderRadius: 2 }}
        role="alert"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300">
          CONNECTION FAILED
        </span>
        <p className="text-base font-semibold text-white normal-case">
          couldn&apos;t connect to the battle. the host may have just started
          — your link might be a moment behind.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onError}
            style={{ touchAction: 'manipulation', borderRadius: 2 }}
            className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
          >
            GO BACK
          </button>
          <button
            type="button"
            onClick={onTryAgain}
            style={{ touchAction: 'manipulation', borderRadius: 2 }}
            className="inline-flex h-11 flex-[1.2] items-center justify-center bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  return <CenteredSpinner label="JOINING BATTLE…" />;
}

function CenteredSpinner({
  label,
  iconClassName,
}: {
  label: string;
  iconClassName?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 border-2 border-white/20 bg-black p-8 text-center"
      style={{ borderRadius: 2 }}
    >
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      >
        <Swords
          size={32}
          className={iconClassName ?? 'text-white/60'}
          aria-hidden
        />
      </motion.div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">{label}</p>
    </div>
  );
}

