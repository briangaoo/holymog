'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Download,
  Home as HomeIcon,
  Loader2,
  RotateCcw,
  Swords,
  X,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { AuthModal } from '@/components/AuthModal';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { generateBattleShareImage } from '@/lib/battleShareImageGenerator';
import {
  clearActiveBattle,
  readActiveBattle,
  writeActiveBattle,
} from '@/lib/activeBattle';
import { BattleRoom } from '../BattleRoom';

// ---- Types -----------------------------------------------------------------

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
      <FinishedScreen
        result={phase.result}
        currentUserId={user.id}
        onAgain={() => setPhase({ kind: 'matchmaking' })}
      />
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

  // Pair + ready handoff (queue POST + realtime subscribe + poll).
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    const handlePaired = async (battleId: string) => {
      if (cancelled) return;
      if (pairedBattleRef.current === battleId) return;
      pairedBattleRef.current = battleId;
      setStatus('found');
      try {
        const [tokenRes, battleRes] = await Promise.all([
          fetch(`/api/battle/${battleId}/token`),
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
        if (cancelled || !tokenRes.ok || !battleRes.ok) {
          // Allow a future signal to retry — pair_two() already inserted us.
          pairedBattleRef.current = null;
          return;
        }
        const tokenData = (await tokenRes.json()) as { token: string; url: string };
        const battleRows = (await battleRes.json()) as Array<{
          started_at: string | null;
        }>;
        const startedAtIso = battleRows[0]?.started_at;
        const startedAt = startedAtIso ? Date.parse(startedAtIso) : Date.now();
        if (cancelled) return;
        setStatus('connecting');
        onReady(battleId, tokenData.token, tokenData.url, startedAt);
      } catch {
        pairedBattleRef.current = null;
      }
    };

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
          if (row.battle_id) void handlePaired(row.battle_id);
        },
      )
      .subscribe();

    void (async () => {
      try {
        const res = await fetch('/api/battle/queue', { method: 'POST' });
        if (cancelled) return;
        const data = (await res.json()) as { battle_id?: string; paired?: boolean };
        if (data.battle_id && data.paired) {
          void handlePaired(data.battle_id);
        }
      } catch {
        // realtime + poll will retry
      }
    })();

    const pollId = window.setInterval(async () => {
      if (cancelled || pairedBattleRef.current) return;
      try {
        const res = await fetch('/api/battle/queue', { method: 'POST' });
        const data = (await res.json()) as { battle_id?: string };
        if (data.battle_id) void handlePaired(data.battle_id);
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [userId, onReady]);

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
            boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.18)',
          }}
        />
        {/* Identity pill */}
        <div
          className="absolute flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 16px)',
            left: 'max(env(safe-area-inset-left), 16px)',
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
          <span className="truncate max-w-[12rem]">
            you{displayName ? ` · ${displayName}` : ''}
          </span>
        </div>
      </div>

      {/* Opponent slot. */}
      <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-white/[0.015] to-black">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(56,189,248,0.06), transparent 60%)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        />

        <OpponentSlot status={status} />

        <div
          className="absolute flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 16px)',
            left: 'max(env(safe-area-inset-left), 16px)',
          }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'finding' ? 'animate-pulse bg-zinc-500' : 'bg-sky-400'
            }`}
          />
          <span>
            {status === 'finding'
              ? 'searching'
              : status === 'found'
                ? 'opponent found'
                : 'connecting'}
          </span>
        </div>
      </div>

      {/* Sky-blue divider in the exact middle of the viewport. Vertical
          on desktop, horizontal on mobile. Sits on the seam between the
          two grid cells (which themselves have no gap, so the tiles
          fill exactly half). */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 bottom-0 hidden w-px -translate-x-1/2 md:block"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(56,189,248,0.45) 50%, transparent 100%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 md:hidden"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.45) 50%, transparent 100%)',
        }}
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
        }}
        className="absolute z-10 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 text-xs text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <X size={12} aria-hidden /> cancel
      </button>
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
          <Swords size={48} className="text-zinc-500" aria-hidden />
        </motion.div>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-white">finding an opponent</p>
          <p className="text-xs text-zinc-500">usually under 30 seconds</p>
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
        <Swords size={48} className="text-sky-400" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-white">opponent found</p>
          <p className="text-xs text-zinc-500">getting ready…</p>
        </div>
      </motion.div>
    );
  }
  return (
    <div className="relative flex flex-col items-center gap-4 px-6 text-center">
      <Loader2 size={48} className="animate-spin text-sky-400" aria-hidden />
      <p className="text-lg font-semibold text-white">connecting…</p>
    </div>
  );
}

// ---- Finished (slim full-screen result) ----------------------------------

function FinishedScreen({
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
      const navWithShare = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: {
          files?: File[];
          title?: string;
          text?: string;
        }) => Promise<void>;
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
      // best-effort
    } finally {
      setSharing(false);
    }
  }, [me, opponent, youWon]);

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {/* Win-flash overlay (winner only). */}
      {youWon && (
        <motion.div
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 z-50"
          style={{
            background:
              'radial-gradient(circle at center, rgba(16,185,129,0.35) 0%, rgba(0,0,0,0) 65%)',
          }}
        />
      )}

      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col items-stretch justify-center px-5"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 32px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        }}
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
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.06,
          }}
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

        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
          >
            <HomeIcon size={14} aria-hidden /> home
          </Link>
          <button
            type="button"
            onClick={onAgain}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-zinc-100"
          >
            <RotateCcw size={14} aria-hidden /> find another
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
      <Link
        href={`/@${entry.display_name}`}
        className="truncate text-sm text-zinc-300 hover:text-white hover:underline underline-offset-2"
      >
        {entry.display_name}
      </Link>
    </motion.div>
  );
}
