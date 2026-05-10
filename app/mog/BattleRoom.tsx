'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { motion, AnimatePresence } from 'framer-motion';
import { getScoreColor } from '@/lib/scoreColor';
import { getTier } from '@/lib/tier';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { Frame } from '@/components/customization/Frame';
import { Badge } from '@/components/customization/Badge';
import { NameFx } from '@/components/customization/NameFx';
import type { UserStats } from '@/lib/customization';
import type { SubScores } from '@/types';
import { battleSfx } from '@/lib/battleSfx';

// ---- Types -----------------------------------------------------------------

type ScoreUpdate = {
  user_id: string;
  overall: number;
  improvement: string;
  peak: number;
  ts: number;
};

type FinishPayload = {
  battle_id: string;
  // Optional so old cached results without kind still render. New
  // payloads from /api/battle/finish always include this; private
  // battles light up the "rematch" CTA on the result screen.
  kind?: 'public' | 'private';
  winner_id: string | null;
  participants: Array<{
    user_id: string;
    display_name: string;
    final_score: number;
    is_winner: boolean;
  }>;
};

type BattleScores = Record<
  string,
  {
    overall: number;
    peak: number;
    improvement: string;
  }
>;

type Props = {
  battleId: string;
  livekitToken: string;
  livekitUrl: string;
  startedAt: number; // ms timestamp from the battles row
  onFinished: (result: FinishPayload) => void;
};

const SCAN_DURATION_MS = 10_000;
const REAL_CALL_COUNT = 10;
const REAL_INTERVAL_MS = 1000;
const SYNTHETIC_OFFSET_MS = 500;

// ---- Top-level component ---------------------------------------------------

export function BattleRoom(props: Props) {
  const [connected, setConnected] = useState(false);

  return (
    <LiveKitRoom
      token={props.livekitToken}
      serverUrl={props.livekitUrl}
      connect
      audio
      video
      onConnected={() => setConnected(true)}
      data-lk-theme="default"
      style={{ width: '100%', height: '100dvh' }}
    >
      <RoomAudioRenderer />
      <BattleInterior
        battleId={props.battleId}
        startedAt={props.startedAt}
        connected={connected}
        onFinished={props.onFinished}
      />
    </LiveKitRoom>
  );
}

// ---- In-battle UI ----------------------------------------------------------

function BattleInterior({
  battleId,
  startedAt,
  connected,
  onFinished,
}: {
  battleId: string;
  startedAt: number;
  connected: boolean;
  onFinished: (result: FinishPayload) => void;
}) {
  // Subscribe to all video tracks in the room (mine + opponent's). LiveKit
  // returns one entry per (participant, track-source). We render in source
  // order so the grid is stable.
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  // Viewport orientation drives the row-distribution math below. Defaults
  // to portrait pre-mount so SSR + first paint match phone defaults.
  const isLandscape = useIsLandscape();

  // Local participant — needed for capturing frames to score.
  const { localParticipant } = useLocalParticipant();
  const myUserIdRef = useRef<string>('');
  useEffect(() => {
    myUserIdRef.current = localParticipant?.identity ?? '';
  }, [localParticipant]);

  /** Play the appropriate SFX flourish based on the finish payload.
   *  Looks up whether `myUserIdRef` corresponds to the winner. Tied
   *  to a ref so it can be called from realtime + local finalisation
   *  paths without re-subscribing the broadcast channel on every
   *  identity tick. */
  const playFinishSfx = useCallback((result: FinishPayload) => {
    const me = result.participants.find(
      (p) => p.user_id === myUserIdRef.current,
    );
    if (me?.is_winner) battleSfx.win();
    else if (me) battleSfx.loss();
    // If `me` is undefined (spectator?), neither plays — silent finish.
  }, []);

  // Score state per user.
  const [scores, setScores] = useState<BattleScores>({});
  // Set of user_ids that have left the battle (tab-close, navigated away,
  // or explicit leave). Used to dim their tile so the others see they're
  // gone in real time.
  const [leftUsers, setLeftUsers] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<'starting' | 'active' | 'finished'>(
    Date.now() < startedAt ? 'starting' : 'active',
  );

  // Tick — drives the countdown + active timer. Doesn't need to be 60fps;
  // 10Hz is plenty for the visual readout.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  // Subscribe to Supabase Realtime for score updates + battle.finished.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`battle:${battleId}`)
      .on(
        'broadcast',
        { event: 'score.update' },
        (msg: { payload: ScoreUpdate }) => {
          const update = msg.payload;
          setScores((prev) => ({
            ...prev,
            [update.user_id]: {
              overall: update.overall,
              peak: Math.max(prev[update.user_id]?.peak ?? 0, update.peak),
              improvement: update.improvement,
            },
          }));
        },
      )
      .on(
        'broadcast',
        { event: 'battle.finished' },
        (msg: { payload: FinishPayload }) => {
          playFinishSfx(msg.payload);
          onFinished(msg.payload);
        },
      )
      .on(
        'broadcast',
        { event: 'participant.left' },
        (msg: { payload: { user_id?: string } }) => {
          const id = msg.payload.user_id;
          if (typeof id !== 'string') return;
          setLeftUsers((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [battleId, onFinished, playFinishSfx]);

  // -------- Phase transitions + scoring loop --------
  // Off-screen video + canvas used to capture frames from LiveKit's local
  // camera track. Created once, reused for every score call.
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (captureVideoRef.current === null && typeof document !== 'undefined') {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    captureVideoRef.current = v;
  }
  if (captureCanvasRef.current === null && typeof document !== 'undefined') {
    captureCanvasRef.current = document.createElement('canvas');
  }

  // Hook the local camera track up to the off-screen video element so
  // drawImage() has a source.
  useEffect(() => {
    if (!localParticipant) return;
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track) return;
    const v = captureVideoRef.current;
    if (!v) return;
    const ms = new MediaStream();
    ms.addTrack(track.mediaStreamTrack);
    v.srcObject = ms;
    void v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [localParticipant]);

  /** Capture a frame from the off-screen video, return a JPEG data URL. */
  const captureFrame = useCallback((): string | null => {
    const v = captureVideoRef.current;
    const c = captureCanvasRef.current;
    if (!v || !c || v.readyState < 2 || v.videoWidth === 0) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    // Mirror horizontally — same convention as the solo scan flow.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }, []);

  /** Send one frame to /api/battle/score. Best-effort; no UI update here
   *  (the broadcast that fires after the call resolves drives the UI). */
  const sendScoreCall = useCallback(async () => {
    if (!connected) return;
    const image = captureFrame();
    if (!image) return;
    try {
      await fetch('/api/battle/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle_id: battleId, imageBase64: image }),
      });
    } catch {
      // best-effort
    }
  }, [battleId, captureFrame, connected]);

  // ---- Schedule the 10 real calls + 10 synthetic mid-calls --------
  useEffect(() => {
    if (!connected) return;
    const startMs = startedAt;
    const timers: number[] = [];

    for (let i = 0; i < REAL_CALL_COUNT; i++) {
      const fireAtMs = startMs + i * REAL_INTERVAL_MS;
      const delay = Math.max(0, fireAtMs - Date.now());
      timers.push(window.setTimeout(() => void sendScoreCall(), delay));
    }

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [connected, startedAt, sendScoreCall]);

  // ---- Synthetic jitter on own tile between real updates ----
  // When MY score updates (from server broadcast), schedule a synthetic
  // value 500ms later that's a few points off the real one. Pure local —
  // not broadcast.
  const myUserId = localParticipant?.identity ?? '';
  const myLastRealRef = useRef<number | null>(null);
  const lastReal = scores[myUserId]?.overall;
  useEffect(() => {
    if (typeof lastReal !== 'number') return;
    if (myLastRealRef.current === lastReal) return;
    myLastRealRef.current = lastReal;
    const t = window.setTimeout(() => {
      setScores((prev) => {
        const cur = prev[myUserId];
        if (!cur) return prev;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const mag = 1 + Math.floor(Math.random() * 2); // ±1 or ±2
        const synthetic = Math.max(0, Math.min(100, cur.overall + dir * mag));
        return {
          ...prev,
          [myUserId]: {
            ...cur,
            overall: synthetic,
            peak: Math.max(cur.peak, synthetic),
          },
        };
      });
    }, SYNTHETIC_OFFSET_MS);
    return () => window.clearTimeout(t);
  }, [lastReal, myUserId]);

  // ---- SFX preference --------------------------------------------------
  // One-shot fetch on mount: pull `mute_battle_sfx` from the user's
  // profile and apply globally to the SFX module. The fetch is
  // independent of the battle flow; failure (network, unauth)
  // defaults to "not muted" which is also the DB default.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          profile: { mute_battle_sfx?: boolean } | null;
        };
        if (cancelled) return;
        battleSfx.setMuted(Boolean(data.profile?.mute_battle_sfx));
      } catch {
        // best-effort; default unmuted
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Countdown SFX ---------------------------------------------------
  // Fires a tick on each integer-second boundary during the 3-2-1
  // pre-roll, plus a "go" chime as we cross into active. We track the
  // last-played second in a ref so a re-render doesn't re-trigger on
  // the same number.
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'starting') {
      lastTickRef.current = null;
      return;
    }
    const remaining = Math.ceil(Math.max(0, startedAt - now) / 1000);
    if (remaining > 0 && remaining <= 3 && lastTickRef.current !== remaining) {
      lastTickRef.current = remaining;
      battleSfx.countdownTick();
    }
  }, [phase, now, startedAt]);

  // ---- Phase transitions ---------------------------------------------------
  useEffect(() => {
    if (phase === 'starting' && now >= startedAt) {
      setPhase('active');
      battleSfx.countdownGo();
    }
    if (phase === 'active' && now >= startedAt + SCAN_DURATION_MS) {
      setPhase('finished');
      // Fire finalisation. First caller wins; subsequent receive cached result.
      void fetch('/api/battle/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle_id: battleId }),
      })
        .then((r) => r.json())
        .then((data: { result?: FinishPayload }) => {
          if (data.result) {
            playFinishSfx(data.result);
            onFinished(data.result);
          }
        })
        .catch(() => {
          // Realtime may still deliver the finish event from the other
          // participant's call; soft-fail.
        });
    }
  }, [phase, now, startedAt, battleId, onFinished, playFinishSfx]);

  // ---- Tab close: leave the battle ----------------------------------------
  useEffect(() => {
    const handler = () => {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const body = new Blob(
          [JSON.stringify({ battle_id: battleId })],
          { type: 'application/json' },
        );
        navigator.sendBeacon('/api/battle/leave', body);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [battleId]);

  // ---- Render -------------------------------------------------------------
  const remainingMs = Math.max(0, startedAt + SCAN_DURATION_MS - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const countdownSec = Math.ceil(Math.max(0, startedAt - now) / 1000);

  // Zoom-style adaptive layout — flex-rows where each row holds a
  // computed number of tiles. Each row gets equal height (flex-1), each
  // tile within a row gets equal width (flex-1). For 2 the layout
  // mirrors the public matchmaking screen (top/bottom on portrait,
  // left/right on landscape). Larger counts spread to balance
  // tile aspect-ratio against orientation. Hairline sky dividers sit
  // on tile seams, no gaps.
  const rowLayout = participantRowLayout(tracks.length, isLandscape);
  let consumed = 0;

  return (
    <div className="relative min-h-dvh bg-black text-white">
      <div className="flex h-dvh w-full flex-col">
        {rowLayout.map((cellsInRow, rowIdx) => {
          const slice = tracks.slice(consumed, consumed + cellsInRow);
          consumed += cellsInRow;
          const isLastRow = rowIdx === rowLayout.length - 1;
          return (
            <div
              key={rowIdx}
              className={`flex min-h-0 flex-1 ${
                isLastRow ? '' : 'border-b border-sky-500/30'
              }`}
            >
              {slice.map((trackRef, colIdx) => {
                const userId = trackRef.participant.identity;
                const score = scores[userId];
                const hasLeft = leftUsers.has(userId);
                const isLastCell = colIdx === slice.length - 1;
                return (
                  <div
                    key={`${userId}-${rowIdx}-${colIdx}`}
                    className={`relative min-w-0 flex-1 overflow-hidden bg-black transition-opacity duration-300 ${
                      isLastCell ? '' : 'border-r border-sky-500/30'
                    }`}
                    style={{ opacity: hasLeft ? 0.35 : 1 }}
                  >
                    <ParticipantTile
                      trackRef={trackRef}
                      className="h-full w-full"
                    />
                    <ScoreOverlay
                      displayName={
                        trackRef.participant.name ||
                        trackRef.participant.identity
                      }
                      score={score}
                      meta={parseMetadata(trackRef.participant.metadata)}
                    />
                    {hasLeft && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300 backdrop-blur">
                          left
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Active-window timer (top centre). */}
      {phase === 'active' && (
        <div
          className="pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-3 py-1 font-num text-sm font-semibold tabular-nums backdrop-blur"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 4px)' }}
        >
          {remainingSec}s
        </div>
      )}

      {/* 3-2-1 starting overlay — color ramps from red → orange → emerald
          as the countdown approaches zero, with an overshoot spring on
          each number swap and a bigger exit so the digit feels like it's
          launching toward the camera. */}
      <AnimatePresence>
        {phase === 'starting' && countdownSec > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/60"
            aria-live="polite"
          >
            <motion.span
              key={countdownSec}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="font-num"
              style={{
                fontSize: 'clamp(140px, 40vw, 280px)',
                fontWeight: 900,
                color: countdownColor(countdownSec),
                textShadow: `0 0 60px ${countdownColor(countdownSec)}88`,
              }}
            >
              {countdownSec}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Tile-distribution table: number of tiles per row, by participant
 * count and orientation. The result is rendered as flex-col rows where
 * each row has flex-row tiles inside, all flex-1 — so every cell is
 * filled (no empty slots) and only the aspect ratio shifts between
 * rows when N is odd. For N <= 10 (max private-party size) every
 * layout is hand-tuned; beyond 10 we fall back to a square-ish grid.
 */
function participantRowLayout(n: number, isLandscape: boolean): number[] {
  if (n <= 1) return [Math.max(1, n)];

  if (isLandscape) {
    switch (n) {
      case 2: return [2];
      case 3: return [3];
      case 4: return [2, 2];
      case 5: return [3, 2];
      case 6: return [3, 3];
      case 7: return [4, 3];
      case 8: return [4, 4];
      case 9: return [3, 3, 3];
      case 10: return [4, 3, 3];
    }
  } else {
    switch (n) {
      case 2: return [1, 1];
      case 3: return [1, 2];
      case 4: return [2, 2];
      case 5: return [2, 3];
      case 6: return [2, 2, 2];
      case 7: return [2, 2, 3];
      case 8: return [2, 3, 3];
      case 9: return [3, 3, 3];
      case 10: return [2, 3, 3, 2];
    }
  }

  // Fallback for unanticipated counts: square-ish grid, tolerate empty
  // cells in the last row.
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out: number[] = [];
  let left = n;
  for (let r = 0; r < rows; r++) {
    const take = Math.min(cols, left);
    out.push(take);
    left -= take;
  }
  return out;
}

function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const update = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return isLandscape;
}

type ParticipantMeta = {
  avatarUrl?: string;
  equippedFrame?: string;
  equippedFlair?: string;
  equippedNameFx?: string;
  // userStats fields for smart cosmetic rendering on battle tiles.
  elo?: number;
  currentStreak?: number;
  bestScanOverall?: number;
  matchesWon?: number;
  weakestSubScore?: keyof SubScores;
  isSubscriber?: boolean;
};

function parseMetadata(metadata: string | undefined): ParticipantMeta {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const out: ParticipantMeta = {};
    if (typeof parsed.avatarUrl === 'string') out.avatarUrl = parsed.avatarUrl;
    if (typeof parsed.equippedFrame === 'string')
      out.equippedFrame = parsed.equippedFrame;
    if (typeof parsed.equippedFlair === 'string')
      out.equippedFlair = parsed.equippedFlair;
    if (typeof parsed.equippedNameFx === 'string')
      out.equippedNameFx = parsed.equippedNameFx;
    if (typeof parsed.elo === 'number') out.elo = parsed.elo;
    if (typeof parsed.currentStreak === 'number')
      out.currentStreak = parsed.currentStreak;
    if (typeof parsed.bestScanOverall === 'number')
      out.bestScanOverall = parsed.bestScanOverall;
    if (typeof parsed.matchesWon === 'number')
      out.matchesWon = parsed.matchesWon;
    if (
      parsed.weakestSubScore === 'jawline' ||
      parsed.weakestSubScore === 'eyes' ||
      parsed.weakestSubScore === 'skin' ||
      parsed.weakestSubScore === 'cheekbones'
    ) {
      out.weakestSubScore = parsed.weakestSubScore;
    }
    if (parsed.isSubscriber === true) out.isSubscriber = true;
    return out;
  } catch {
    return {};
  }
}

/** Build a UserStats object for smart cosmetics from parsed participant
 *  metadata. */
function userStatsFromMeta(meta: ParticipantMeta): UserStats {
  return {
    elo: meta.elo ?? null,
    bestScanOverall: meta.bestScanOverall ?? null,
    currentStreak: meta.currentStreak ?? null,
    currentWinStreak: meta.currentStreak ?? null,
    matchesWon: meta.matchesWon ?? null,
    weakestSubScore: meta.weakestSubScore ?? null,
  };
}

function countdownColor(n: number): string {
  // 3 → red, 2 → amber, 1 → emerald. Anything else falls back to white.
  if (n >= 3) return '#ef4444';
  if (n === 2) return '#f59e0b';
  if (n === 1) return '#10b981';
  return '#ffffff';
}

// ---- Per-tile score overlay -----------------------------------------------

function AvatarPill({
  displayName,
  meta,
}: {
  displayName: string;
  meta: ParticipantMeta;
}) {
  // Pill links to the participant's public profile so the rest of the
  // room can tap a face mid-battle and read up on someone. The video
  // tile underneath stays interactive — the link is only on the pill.
  // Equipped frame + badge render here too, so flair shows during
  // battles (the "discord route" for monetization).
  const userStats = userStatsFromMeta(meta);
  const inner = meta.avatarUrl ? (
    <img
      src={meta.avatarUrl}
      alt=""
      className="h-5 w-5 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[9px] font-semibold text-white">
      {(displayName.charAt(0) || '?').toUpperCase()}
    </span>
  );

  return (
    <Link
      href={`/@${displayName}`}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 pl-1 pr-2.5 py-1 backdrop-blur transition-colors hover:bg-black/75"
    >
      {meta.equippedFrame ? (
        <Frame slug={meta.equippedFrame} size={20} userStats={userStats}>
          {inner}
        </Frame>
      ) : (
        inner
      )}
      <span className="text-[11px] text-white/85">
        <NameFx slug={meta.equippedNameFx ?? null} userStats={userStats}>
          {displayName}
        </NameFx>
      </span>
      {meta.equippedFlair && (
        <Badge slug={meta.equippedFlair} userStats={userStats} />
      )}
    </Link>
  );
}

function ScoreOverlay({
  displayName,
  score,
  meta,
}: {
  displayName: string;
  score?: { overall: number; peak: number; improvement: string };
  meta: ParticipantMeta;
}) {
  if (!score) {
    return <AvatarPill displayName={displayName} meta={meta} />;
  }

  const tier = getTier(score.overall);
  const color = getScoreColor(score.overall);
  const peakColor = getScoreColor(score.peak);

  return (
    <>
      {/* Display name + avatar top-left */}
      <AvatarPill displayName={displayName} meta={meta} />

      {/* Big score top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur"
      >
        <div className="flex items-baseline gap-2">
          <span
            className="font-num text-3xl font-extrabold leading-none tabular-nums"
            style={{
              color,
              textShadow: `0 0 18px ${color}88`,
            }}
          >
            {score.overall}
          </span>
          <span className="text-xs uppercase tracking-[0.18em] text-white/60 normal-case">
            {tier.letter}
          </span>
        </div>
        <div className="text-[10px] text-zinc-400">
          peak{' '}
          <span
            className="font-num font-semibold tabular-nums"
            style={{ color: peakColor }}
          >
            {score.peak}
          </span>
        </div>
      </div>

      {/* Improvement ticker bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 backdrop-blur"
      >
        needs: <span className="font-semibold">{score.improvement}</span>
      </div>
    </>
  );
}

