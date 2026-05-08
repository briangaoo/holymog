'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Local participant — needed for capturing frames to score.
  const { localParticipant } = useLocalParticipant();

  // Score state per user.
  const [scores, setScores] = useState<BattleScores>({});
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
          onFinished(msg.payload);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [battleId, onFinished]);

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
        const mag = 1 + Math.floor(Math.random() * 5);
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

  // ---- Phase transitions ---------------------------------------------------
  useEffect(() => {
    if (phase === 'starting' && now >= startedAt) {
      setPhase('active');
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
          if (data.result) onFinished(data.result);
        })
        .catch(() => {
          // Realtime may still deliver the finish event from the other
          // participant's call; soft-fail.
        });
    }
  }, [phase, now, startedAt, battleId, onFinished]);

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

  return (
    <div className="relative min-h-dvh bg-black text-white">
      {/* LiveKit grid — one tile per remote+local participant. */}
      <div className="grid h-dvh w-full grid-cols-1 sm:grid-cols-2">
        {tracks.map((trackRef, i) => {
          const userId = trackRef.participant.identity;
          const score = scores[userId];
          return (
            <div key={`${userId}-${i}`} className="relative overflow-hidden bg-black">
              <ParticipantTile trackRef={trackRef} className="h-full w-full" />
              <ScoreOverlay
                displayName={trackRef.participant.name || trackRef.participant.identity}
                score={score}
              />
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

      {/* 3-2-1 starting overlay. */}
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
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              className="font-num text-white"
              style={{ fontSize: 'clamp(140px, 40vw, 280px)', fontWeight: 900 }}
            >
              {countdownSec}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Per-tile score overlay -----------------------------------------------

function ScoreOverlay({
  displayName,
  score,
}: {
  displayName: string;
  score?: { overall: number; peak: number; improvement: string };
}) {
  if (!score) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur"
      >
        {displayName}
      </div>
    );
  }

  const tier = getTier(score.overall);
  const color = getScoreColor(score.overall);
  const peakColor = getScoreColor(score.peak);

  return (
    <>
      {/* Display name top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur"
      >
        {displayName}
      </div>

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

