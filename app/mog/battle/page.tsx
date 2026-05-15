'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Swords, X } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { AuthModal } from '@/components/AuthModal';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { MogResultScreen } from '@/components/MogResultScreen';
import {
  clearActiveBattle,
  readActiveBattle,
  writeActiveBattle,
} from '@/lib/activeBattle';
import {
  BattleConsentModal,
  readBattleConsent,
  writeBattleConsent,
} from '@/components/BattleConsentModal';
import { BattleRoom } from '../BattleRoom';

// ---- Types -----------------------------------------------------------------

type FinishPayload = {
  battle_id: string;
  kind?: 'public' | 'private';
  winner_id: string | null;
  is_tie?: boolean;
  participants: Array<{
    user_id: string;
    display_name: string;
    final_score: number;
    is_winner: boolean;
    is_tie?: boolean;
  }>;
  elo_changes?: Array<{
    user_id: string;
    before: number;
    after: number;
    delta: number;
  }>;
};

type Phase =
  | { kind: 'matchmaking' }
  | {
      kind: 'active';
      battleId: string;
      token: string;
      url: string;
      startedAt: number;
    }
  | { kind: 'finished'; result: FinishPayload };

type MatchStatus = 'finding' | 'found' | 'connecting';

// ---- Page ------------------------------------------------------------------

/**
 * /mog/battle — full-screen public 1v1 experience.
 *
 * Self-contained route that owns matchmaking → active → finished. Lives
 * outside the regular AppHeader chrome so the camera tiles can fill
 * exactly half the viewport each. Body scroll is locked while mounted.
 *
 * On mount, checks the active-battle localStorage entry. If a public
 * battle is currently in starting/active state, restore directly into
 * BattleRoom (mints a fresh LiveKit token). If it's a private battle,
 * bounce to /mog so the lobby flow there can pick it up. Otherwise
 * start fresh matchmaking.
 */
export default function PublicBattlePage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'matchmaking' });
  const [reconnectChecked, setReconnectChecked] = useState(false);

  // Battle consent gate. /mog/battle IS the queue action, so the modal
  // opens on landing if the user hasn't consented yet. Matchmaking
  // starts only after acknowledgement (the existing `PublicMatchmaking`
  // mount waits on `consented`).
  const [consented, setConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  useEffect(() => {
    setConsented(readBattleConsent());
    setConsentChecked(true);
  }, []);
  const acknowledgeBattleConsent = () => {
    writeBattleConsent();
    setConsented(true);
  };

  // Lock body + html scroll for the duration of the full-screen experience.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Reconnection check: if a battle is mid-flight, restore.
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
          `${supabaseUrl}/rest/v1/battles?id=eq.${entry.battle_id}&select=state,kind,started_at`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          },
        );
        const rows = (await res.json()) as Array<{
          state: string;
          kind: string;
          started_at: string | null;
        }>;
        const row = rows[0];
        if (cancelled) return;
        if (!row || row.state === 'finished' || row.state === 'abandoned') {
          clearActiveBattle();
          setReconnectChecked(true);
          return;
        }
        if (row.kind !== 'public') {
          // Private battles live on /mog (lobby UI etc.). Bounce.
          router.replace('/mog');
          return;
        }
        if (row.state === 'starting' || row.state === 'active') {
          // Mint a fresh token and resume into BattleRoom.
          const tokenRes = await fetch(`/api/battle/${entry.battle_id}/token`);
          if (cancelled) return;
          if (!tokenRes.ok) {
            clearActiveBattle();
            setReconnectChecked(true);
            return;
          }
          const tokenData = (await tokenRes.json()) as {
            token: string;
            url: string;
          };
          const startedAt = row.started_at
            ? Date.parse(row.started_at)
            : Date.now();
          setPhase({
            kind: 'active',
            battleId: entry.battle_id,
            token: tokenData.token,
            url: tokenData.url,
            startedAt,
          });
        }
      } catch {
        clearActiveBattle();
      } finally {
        if (!cancelled) setReconnectChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  // Persist the active battle so reconnection works after a reload.
  useEffect(() => {
    if (phase.kind === 'active') {
      writeActiveBattle({ battle_id: phase.battleId, isHost: false });
    } else if (phase.kind === 'finished') {
      clearActiveBattle();
    }
  }, [phase]);

  if (loading || !reconnectChecked) {
    return (
      <div className="fixed inset-0 bg-black">
        <FullPageSpinner label="loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black">
        <AuthModal
          open
          onClose={() => router.push('/')}
          next="/mog/battle"
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
        onFindAnother={() => setPhase({ kind: 'matchmaking' })}
      />
    );
  }

  // Block matchmaking until the user has accepted the battle consent
  // notice. Until then we show the modal full-screen over a black
  // backdrop — the camera doesn't start, no queue entry is created.
  if (!consentChecked) {
    return (
      <div className="fixed inset-0 bg-black">
        <FullPageSpinner label="loading" />
      </div>
    );
  }
  if (!consented) {
    return (
      <div className="fixed inset-0 bg-black">
        <BattleConsentModal
          open
          onAcknowledge={acknowledgeBattleConsent}
        />
      </div>
    );
  }

  return (
    <PublicMatchmaking
      userId={user.id}
      displayName={user.name ?? undefined}
      avatarUrl={user.image ?? undefined}
      onReady={(battleId, token, url, startedAt) =>
        setPhase({ kind: 'active', battleId, token, url, startedAt })
      }
      onCancel={async () => {
        await fetch('/api/battle/queue', { method: 'DELETE' });
        router.push('/mog');
      }}
    />
  );
}

// ---- Public matchmaking (split-screen camera + opponent slot) -------------

function PublicMatchmaking({
  userId,
  displayName,
  avatarUrl,
  onReady,
  onCancel,
}: {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  onReady: (
    battleId: string,
    token: string,
    url: string,
    startedAt: number,
  ) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<MatchStatus>('finding');
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Bail-out state for the pair → token-fetch handoff. Without a
  // ceiling, a broken token endpoint (LIVEKIT env missing, network
  // hiccup, etc.) leaves the user "OPPONENT FOUND · CONNECTING" forever
  // while the actual battle runs to completion without them. After
  // MAX_HANDOFF_FAILURES the user sees an explicit error + retry/back.
  const [handoffError, setHandoffError] = useState<string | null>(null);
  // Ticked from the polling-effect closure, also used by the retry
  // handler outside that closure — useState would race the closure's
  // captured value, so a ref keeps the counter authoritative.
  const handoffFailuresRef = useRef(0);
  const MAX_HANDOFF_FAILURES = 3;
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pairedBattleRef = useRef<string | null>(null);

  // Local camera preview via getUserMedia (no LiveKit yet, no face crop).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        const video = localVideoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'camera unavailable';
        setCameraError(msg);
      }
    })();
    return () => {
      cancelled = true;
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  // Pair + ready handoff. The original implementation used a Supabase
  // postgres_changes subscription on battle_participants but RLS blocks
  // that (the policies require auth.uid() match, which Auth.js
  // sessions don't satisfy). Polling /api/battle/queue/status is the
  // reliable path: cheap (~1.5s interval × ~10s wait = a handful of
  // hits) and bypasses RLS via the service-role pool inside the route.
  useEffect(() => {
    let cancelled = false;

    const recordFailure = () => {
      handoffFailuresRef.current++;
      if (handoffFailuresRef.current >= MAX_HANDOFF_FAILURES) {
        // Stop trying. Leave pairedBattleRef set so the polling
        // loop's `if (pairedBattleRef.current) return;` short-
        // circuits — no more requests until the user clicks
        // retry or back.
        setHandoffError(
          'could not connect to the battle. matchmaking may be backed up.',
        );
        return;
      }
      pairedBattleRef.current = null;
    };

    const handlePaired = async (battleId: string) => {
      if (cancelled) return;
      if (pairedBattleRef.current === battleId) return;
      pairedBattleRef.current = battleId;
      setStatus('found');
      try {
        const [tokenRes, stateRes] = await Promise.all([
          fetch(`/api/battle/${battleId}/token`),
          fetch(`/api/battle/${battleId}/state`, { cache: 'no-store' }),
        ]);
        if (cancelled || !tokenRes.ok || !stateRes.ok) {
          recordFailure();
          return;
        }
        const tokenData = (await tokenRes.json()) as { token: string; url: string };
        const stateData = (await stateRes.json()) as { started_at: string | null };
        const startedAt = stateData.started_at
          ? Date.parse(stateData.started_at)
          : Date.now();
        if (cancelled) return;
        // Reset the failure counter on success so a later transient
        // glitch (none of which we expect post-handoff) gets the full
        // retry budget again.
        handoffFailuresRef.current = 0;
        setStatus('connecting');
        onReady(battleId, tokenData.token, tokenData.url, startedAt);
      } catch {
        recordFailure();
      }
    };

    // Kick off the queue once.
    void (async () => {
      try {
        const res = await fetch('/api/battle/queue', { method: 'POST' });
        if (cancelled) return;
        const data = (await res.json()) as { battle_id?: string; paired?: boolean };
        if (data.battle_id && data.paired) {
          void handlePaired(data.battle_id);
        }
      } catch {
        // poll loop will keep trying
      }
    })();

    // Poll /queue/status — fires only when pair_two() has dropped us
    // into a battle. The interval is short because perceived wait
    // matters; the route hits a single indexed query per tick so the
    // DB load is trivial.
    const pollId = window.setInterval(async () => {
      if (cancelled || pairedBattleRef.current) return;
      try {
        const res = await fetch('/api/battle/queue/status', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          paired: boolean;
          battle_id?: string;
        };
        if (data.paired && data.battle_id) {
          void handlePaired(data.battle_id);
        }
      } catch {
        // ignore
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [userId, onReady]);

  const onRetryHandoff = () => {
    handoffFailuresRef.current = 0;
    pairedBattleRef.current = null;
    setHandoffError(null);
    setStatus('finding');
    // The polling-loop tick will fire on its next 1.5s interval and
    // re-enter handlePaired. No need to manually kick anything.
  };

  return (
    <div className="fixed inset-0 grid grid-rows-2 bg-black md:grid-cols-2 md:grid-rows-1">
      {/* You — local preview, fills exactly one half. */}
      <div className="relative flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-sm text-red-300">camera unavailable</p>
            <p className="text-xs text-zinc-500">{cameraError}</p>
          </div>
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.20)',
          }}
        />
        {/* Identity pill */}
        <div
          className="absolute flex items-center gap-2 border border-white/30 bg-black px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 16px)',
            left: 'max(env(safe-area-inset-left), 16px)',
            borderRadius: 2,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          )}
          <span className="truncate max-w-[12rem]">
            YOU{displayName ? ` · ${displayName.toUpperCase()}` : ''}
          </span>
        </div>
      </div>

      {/* Opponent slot. */}
      <div className="relative flex items-center justify-center overflow-hidden bg-black">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.20)',
          }}
        />

        <OpponentSlot status={status} />

        <div
          className="absolute flex items-center gap-2 border border-white/30 bg-black px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/70"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 16px)',
            left: 'max(env(safe-area-inset-left), 16px)',
            borderRadius: 2,
          }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'finding' ? 'animate-pulse bg-white/40' : 'bg-white'
            }`}
          />
          <span>
            {status === 'finding'
              ? 'SEARCHING'
              : status === 'found'
                ? 'OPPONENT FOUND'
                : 'CONNECTING'}
          </span>
        </div>
      </div>

      {/* Hard white divider in the exact middle of the viewport. Vertical
          on desktop, horizontal on mobile. Brutalist seam, no fade. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 bottom-0 hidden w-px -translate-x-1/2 bg-white/40 md:block"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/40 md:hidden"
      />

      {/* Cancel — top-right corner, respects safe-area on phones. */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel matchmaking"
        style={{
          touchAction: 'manipulation',
          top: 'max(env(safe-area-inset-top), 16px)',
          right: 'max(env(safe-area-inset-right), 16px)',
          borderRadius: 2,
        }}
        className="absolute z-10 inline-flex h-11 items-center gap-1.5 border-2 border-white/40 bg-black px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
      >
        <X size={12} aria-hidden /> CANCEL
      </button>

      {/* Handoff-failure overlay — fires when 3 token/state fetches in
          a row failed. Without this the user sat on "OPPONENT FOUND ·
          CONNECTING" forever while the actual battle ran to completion
          without them. Two paths out: TRY AGAIN re-enters the polling
          flow at the next tick, GO BACK calls onCancel which deletes
          the queue row and bounces to mode-select. */}
      {handoffError && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
          role="alert"
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 border-2 border-red-500/60 bg-black p-6 text-center"
            style={{ borderRadius: 2 }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300">
              CONNECTION FAILED
            </span>
            <p className="text-base font-semibold text-white normal-case">
              {handoffError}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04]"
              >
                GO BACK
              </button>
              <button
                type="button"
                onClick={onRetryHandoff}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-[1.2] items-center justify-center bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90"
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpponentSlot({ status }: { status: MatchStatus }) {
  if (status === 'finding') {
    return (
      <div className="relative flex flex-col items-center gap-4 px-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        >
          <Swords size={48} className="text-white/40" aria-hidden />
        </motion.div>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold uppercase tracking-tight text-white">FINDING AN OPPONENT</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">USUALLY UNDER 30 SECONDS</p>
        </div>
      </div>
    );
  }
  if (status === 'found') {
    return (
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center gap-4 px-6 text-center"
      >
        <Swords size={48} className="text-white" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold uppercase tracking-tight text-white">OPPONENT FOUND</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">GETTING READY…</p>
        </div>
      </motion.div>
    );
  }
  return (
    <div className="relative flex flex-col items-center gap-4 px-6 text-center">
      <Loader2 size={48} className="animate-spin text-white" aria-hidden />
      <p className="text-lg font-bold uppercase tracking-tight text-white">CONNECTING…</p>
    </div>
  );
}

