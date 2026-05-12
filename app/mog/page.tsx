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
import { SpectralRim } from '@/components/SpectralRim';
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
      {/* Ambient sky-blue wash anchored top-right — sets the page identity
          without dominating. Mirrors the home-page card colour. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.06) 35%, transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(2,132,199,0.10) 0%, transparent 60%)',
        }}
      />

      <AppHeader authNext="/mog" />
      <main className="relative mx-auto w-full max-w-md px-5 py-6 sm:max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <BackButton onBack={onBack} />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            mog battles
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
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
      {/* Hero "find a battle" — sky-blue spectral rim + off-frame radial,
          mirrors the home-page battle card so the brand identity
          carries through. */}
      <SpectralRim accent="rgba(56,189,248,0.95)" className="rounded-3xl">
        <button
          type="button"
          onClick={findBattle}
          style={{ touchAction: 'manipulation', backgroundColor: '#0a0a0a' }}
          className="group relative flex w-full flex-col overflow-hidden rounded-3xl border border-white/10 p-7 text-left transition-all hover:border-white/20"
        >
          {/* Sky radial glow off-frame on the bottom-right */}
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(56,189,248,0.55) 0%, rgba(14,165,233,0.22) 35%, transparent 65%)',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 backdrop-blur-2xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
          />
          {/* Top sheen */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 35%)',
            }}
          />
          {/* Inner sky rim, matches the home card */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(56,189,248,0.22)',
            }}
          />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="relative flex h-2 w-2"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/70" />
                  <span className="relative h-2 w-2 rounded-full bg-sky-400" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                  ranked · live
                </span>
              </div>
              <Swords
                size={36}
                aria-hidden
                className="text-white drop-shadow-lg"
              />
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold leading-none tracking-tight text-white">
                  find a battle
                </span>
                <span className="text-sm text-white/75">
                  1v1 against a stranger · ~15s incl. matchmaking
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
      </SpectralRim>

      {/* Section divider — small label so the parties block reads as
          "alternative" and the hero clearly dominates. */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          or play with friends
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/5" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Create — rose accent. Warm host vibe, distinct from the
            cool sky-blue hero so the secondary row has its own
            personality. (Green is reserved for the scan brand.) */}
        <SpectralRim
          accent="rgba(244,63,94,0.6)"
          spotlight={140}
          className="rounded-3xl"
        >
          <button
            type="button"
            onClick={onCreate}
            style={{ touchAction: 'manipulation', backgroundColor: '#0a0a0a' }}
            className="group relative flex w-full flex-col gap-2.5 overflow-hidden rounded-3xl border border-white/10 p-5 text-left transition-all hover:border-white/20"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -left-16 h-44 w-44 rounded-full blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(244,63,94,0.30) 0%, transparent 65%)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(244,63,94,0.10)',
              }}
            />
            <Users size={20} aria-hidden className="relative text-rose-200" />
            <span className="relative text-base font-semibold text-white">
              create party
            </span>
            <span className="relative text-xs text-zinc-400">
              share a code · up to 10
            </span>
          </button>
        </SpectralRim>

        {/* Join — violet accent. Cool but distinctly different from the
            sky-blue primary; "portal / enter" reads electric-purple. */}
        <SpectralRim
          accent="rgba(168,85,247,0.6)"
          spotlight={140}
          className="rounded-3xl"
        >
          <button
            type="button"
            onClick={onJoin}
            style={{ touchAction: 'manipulation', backgroundColor: '#0a0a0a' }}
            className="group relative flex w-full flex-col gap-2.5 overflow-hidden rounded-3xl border border-white/10 p-5 text-left transition-all hover:border-white/20"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -right-16 h-44 w-44 rounded-full blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(168,85,247,0.30) 0%, transparent 65%)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(168,85,247,0.10)',
              }}
            />
            <Search size={20} aria-hidden className="relative text-violet-200" />
            <span className="relative text-base font-semibold text-white">
              join party
            </span>
            <span className="relative text-xs text-zinc-400">
              enter a 6-char code
            </span>
          </button>
        </SpectralRim>
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
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
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
    <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <header className="mb-5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          your battles
        </span>
        {unranked ? (
          <span className="text-[10px] uppercase tracking-[0.16em] text-sky-300/80">
            unranked
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            {profile.matches_played} played
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-x-4 gap-y-5">
        <Stat
          label="elo"
          value={profile.elo}
          accent="sky"
          sub={
            eloDelta < 0 ? (
              <span className="text-sky-400/80">{eloDelta}</span>
            ) : eloDelta > 0 ? (
              <span className="text-emerald-400/80">+{eloDelta}</span>
            ) : null
          }
        />
        <Stat label="peak" value={profile.peak_elo} accent="purple" />
        <Stat
          label="streak"
          value={profile.current_streak}
          accent={streakHot ? 'emerald' : undefined}
          sub={
            profile.longest_streak > 0
              ? `longest ${profile.longest_streak}`
              : null
          }
        />
        <Stat
          label="record"
          value={
            unranked ? (
              <span className="text-zinc-500">—</span>
            ) : ties > 0 ? (
              <>
                <span className="text-white">{profile.matches_won}</span>
                <span className="text-zinc-500">W · </span>
                <span className="text-white">{ties}</span>
                <span className="text-zinc-500">T · </span>
                <span className="text-white">{losses}</span>
                <span className="text-zinc-500">L</span>
              </>
            ) : (
              <>
                <span className="text-white">{profile.matches_won}</span>
                <span className="text-zinc-500">W · </span>
                <span className="text-white">{losses}</span>
                <span className="text-zinc-500">L</span>
              </>
            )
          }
        />
        <Stat
          label="win rate"
          value={winRate !== null ? `${winRate}%` : <span className="text-zinc-500">—</span>}
          accent={winRate !== null && winRate >= 50 ? 'emerald' : undefined}
        />
        <Stat
          label="best scan"
          value={
            profile.best_scan_overall === null ? (
              <span className="text-zinc-500">—</span>
            ) : (
              profile.best_scan_overall
            )
          }
          accent={profile.best_scan_overall === null ? undefined : 'emerald'}
        />
      </div>

      {/* Recent W/L ribbon */}
      {recent.length > 0 && (
        <div className="mt-5 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            recent
          </span>
          <div className="flex gap-1">
            {/* Pad to RECENT_RIBBON_LENGTH so the ribbon doesn't shrink
                for users with fewer than 10 battles — empty slots show as
                neutral pips on the LEFT (oldest side). */}
            {Array.from({ length: RECENT_RIBBON_LENGTH - recent.length }).map(
              (_, i) => (
                <span
                  key={`empty-${i}`}
                  aria-hidden
                  className="h-2 w-5 rounded-sm bg-white/[0.04]"
                />
              ),
            )}
            {/* recent is finished_at desc — most recent first. We render
                left-to-right oldest→newest so the rightmost cell is the
                user's last result, which is the conventional reading
                order for win/loss strips. */}
            {[...recent].reverse().map((r) => {
              const tied = r.is_tie === true;
              const label = tied ? 'tie' : r.is_winner ? 'win' : 'loss';
              const cls = tied
                ? 'bg-zinc-400/70'
                : r.is_winner
                  ? 'bg-emerald-400/85'
                  : 'bg-rose-500/70';
              return (
                <span
                  key={r.battle_id}
                  aria-label={label}
                  className={`h-2 w-5 rounded-sm ${cls}`}
                />
              );
            })}
          </div>
          <span
            aria-hidden
            className="ml-auto text-[10px] uppercase tracking-[0.16em] text-zinc-600"
          >
            new →
          </span>
        </div>
      )}

      {unranked && recent.length === 0 && (
        <p className="mt-4 rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2.5 text-[11px] text-sky-200/85">
          play your first battle to start ranking. you&apos;re placed
          provisionally for your first 30 matches (k=32) before settling.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: 'sky' | 'emerald' | 'cyan' | 'purple';
}) {
  const valueColor =
    accent === 'sky'
      ? 'text-sky-300'
      : accent === 'emerald'
        ? 'text-emerald-300'
        : accent === 'cyan'
          ? 'text-cyan-300'
          : accent === 'purple'
            ? 'text-purple-300'
            : 'text-white';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>
      <span
        className={`font-num text-2xl font-extrabold tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </span>
      {sub && (
        <span className="font-num text-[10px] tabular-nums text-zinc-500">
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
      {/* Hero violet halo behind the cells to keep the brand accent
          consistent with the "join party" card on the mode-select
          screen. Subtle — the cells themselves are the focus. */}
      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-5 py-9">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(168,85,247,0.22) 0%, transparent 55%)',
          }}
        />
        <div className="flex flex-col items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/[0.08] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200">
            <Search size={11} aria-hidden /> enter code
          </span>
          <p className="text-[13px] text-zinc-400">
            6 characters · sent by your host
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
              className={`font-num h-14 w-11 rounded-2xl border bg-black/40 text-center text-3xl font-extrabold uppercase tabular-nums text-white caret-transparent transition-all sm:h-16 sm:w-12 sm:text-[2rem] ${
                ch
                  ? 'border-violet-400/55 shadow-[0_0_0_3px_rgba(168,85,247,0.10),inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'border-white/10 hover:border-white/20 focus:border-violet-400/55 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.10),inset_0_1px_0_rgba(255,255,255,0.06)]'
              } focus:outline-none`}
              style={{ textTransform: 'uppercase' }}
            />
          ))}
        </div>
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
          className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-all hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {valid ? (
            <>
              join party <ArrowRight size={14} aria-hidden />
            </>
          ) : (
            'join party'
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
      const data = (await res.json()) as { participants?: LobbyParticipant[] };
      if (Array.isArray(data.participants)) setParticipants(data.participants);
    } catch {
      // ignore
    }
  }, [battleId]);

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
        onStarting();
      })
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
      // The realtime subscription on battles.state will flip us into joining.
    } catch {
      setStartError('could not start — try again.');
      setStarting(false);
    }
  }, [battleId]);

  const canStart = isHost && participants.length >= 2 && !starting;

  // Split the 6-char code into individual cells so the host's display
  // matches the join input — friends scanning their screen see the
  // same chunky visual rhythm in both directions.
  const cells = code.split('');

  return (
    <div className="flex flex-col gap-4">
      {/* Hero code card — rose accent matches the "create party" tile on
          mode-select. Big chunky cells, copy + (when available)
          native share, and a centered "share this with friends" CTA
          replace the cramped row + tiny copy button. */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-5 py-7">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(244,63,94,0.30) 0%, rgba(244,63,94,0.10) 35%, transparent 65%)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-3xl"
          style={{
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(244,63,94,0.10)',
          }}
        />

        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/[0.08] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-rose-400" />
            </span>
            party code
          </span>
          <p className="mt-1 text-[12px] text-zinc-400">
            share with friends · up to 10 players
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
              className="font-num inline-flex h-14 w-11 items-center justify-center rounded-2xl border border-rose-400/40 bg-black/40 text-3xl font-extrabold uppercase tabular-nums text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(244,63,94,0.05)] transition-all group-hover:border-rose-300/65 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(244,63,94,0.12)] sm:h-16 sm:w-12 sm:text-[2rem]"
              style={{ textTransform: 'uppercase' }}
            >
              {ch}
            </span>
          ))}
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
          >
            {copied ? (
              <>
                <Check size={14} aria-hidden /> copied
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden /> copy
              </>
            )}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={onShare}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/[0.10] px-4 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/[0.16]"
            >
              <Share2 size={14} aria-hidden /> share
            </button>
          )}
        </div>
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
          {participants.map((p, idx) => {
            const isYou = p.user_id === userId;
            const isHostRow = idx === 0;
            return (
              <motion.li
                key={p.user_id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10">
                  <AvatarFallback
                    seed={p.display_name}
                    textClassName="text-[11px]"
                  />
                </span>
                <Link
                  href={`/@${p.display_name}`}
                  className="flex-1 truncate text-sm text-white hover:underline underline-offset-2"
                >
                  {p.display_name}
                </Link>
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  {isHostRow && (
                    <span className="rounded-full border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-rose-200">
                      host
                    </span>
                  )}
                  {isYou && <span>you</span>}
                </span>
              </motion.li>
            );
          })}
          {/* Empty placeholder rows so the lobby has a visible "waiting"
              shape before the first opponent joins — better than the
              previous bare "loading…" text. */}
          {participants.length > 0 && participants.length < 2 && (
            <li className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-3 py-2 text-sm text-zinc-500">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-white/10"
              >
                <Loader2 size={12} className="animate-spin text-zinc-500" />
              </span>
              waiting for someone to join…
            </li>
          )}
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
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    (async () => {
      try {
        const [tokenRes, stateRes] = await Promise.all([
          fetch(`/api/battle/${battleId}/token`),
          fetch(`/api/battle/${battleId}/state`, { cache: 'no-store' }),
        ]);
        if (!tokenRes.ok || !stateRes.ok) {
          onError();
          return;
        }
        const tokenData = (await tokenRes.json()) as { token: string; url: string };
        const stateData = (await stateRes.json()) as { started_at: string | null };
        const startedAt = stateData.started_at
          ? Date.parse(stateData.started_at)
          : Date.now();
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

