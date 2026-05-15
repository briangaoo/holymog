'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useConnectionQualityIndicator,
  useLocalParticipant,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionQuality, Track, type Participant } from 'livekit-client';
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
import {
  pushAchievements,
  type AchievementGrant,
} from '@/hooks/useAchievementToast';

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
// Fire the first real-score call this many ms BEFORE the countdown ends,
// so the score is already on screen the instant the active window
// starts. Coupled with the relaxed -3s server-side window guard in
// /api/battle/score, the round-trip can land on time even with a
// 1s+ Vertex latency.
const PRE_FIRE_LEAD_MS = 2000;

// ---- Top-level component ---------------------------------------------------

export function BattleRoom(props: Props) {
  const [connected, setConnected] = useState(false);

  // No audio anywhere: don't publish the local mic, don't subscribe to
  // remote audio, and skip the RoomAudioRenderer entirely. Mog is a
  // face-rating game, not a Zoom call — the camera is the whole point,
  // and audio adds zero gameplay value while introducing meaningful
  // safety surface (under-13 voice exposure, harassment) we don't want.
  return (
    <LiveKitRoom
      token={props.livekitToken}
      serverUrl={props.livekitUrl}
      connect
      audio={false}
      video
      onConnected={() => setConnected(true)}
      data-lk-theme="default"
      style={{ width: '100%', height: '100dvh' }}
    >
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

  // Viewport size drives the grid-shape picker below. Defaults to a
  // portrait phone (390x844) before the useEffect measurement runs so
  // SSR + first paint match the common case.
  const viewport = useViewport();

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
  // drawImage() has a source. Previously this used
  // `localParticipant.getTrackPublication` with `[localParticipant]`
  // as the dep — but `localParticipant` is the same object across
  // renders, so the effect didn't re-fire when the track was
  // published a tick later. Result: scoreFrame() always saw
  // video.readyState=0, returned null, and the entire scoring loop
  // silently no-op'd (battle finished with 0/0 peak scores).
  //
  // The next bug was that `useTracks()` returns a fresh array reference
  // on every parent re-render, so a useEffect with `[tracks]` as the
  // dep would tear down + reattach srcObject on every render — and any
  // captureFrame call during that gap returned null. Memoising the
  // local mediaStreamTrack out of the array (so the effect only re-
  // fires when the actual track object changes) closes that race.
  const localCameraTrack = useMemo(() => {
    const ref = tracks.find(
      (t) => t.participant.isLocal && t.source === Track.Source.Camera,
    );
    return ref?.publication?.track?.mediaStreamTrack ?? null;
  }, [tracks]);

  // Track readiness state — drives the "your camera isn't publishing"
  // banner AND gates the score-call timer schedule below so timers
  // don't fire into a black video element on slow LiveKit publishes.
  // Ref mirror so callbacks don't need to close over the state.
  const [localTrackReady, setLocalTrackReady] = useState(false);
  const localTrackReadyRef = useRef(false);

  useEffect(() => {
    if (!localCameraTrack) {
      setLocalTrackReady(false);
      localTrackReadyRef.current = false;
      return;
    }
    const v = captureVideoRef.current;
    if (!v) return;
    const ms = new MediaStream();
    ms.addTrack(localCameraTrack);
    v.srcObject = ms;

    const markReady = () => {
      if (v.videoWidth > 0 && v.readyState >= 2) {
        setLocalTrackReady(true);
        localTrackReadyRef.current = true;
      }
    };
    v.addEventListener('loadedmetadata', markReady);
    v.addEventListener('canplay', markReady);
    void v.play().catch(() => {});
    if (v.videoWidth > 0 && v.readyState >= 2) markReady();

    return () => {
      v.removeEventListener('loadedmetadata', markReady);
      v.removeEventListener('canplay', markReady);
      // Don't null srcObject here — if React re-runs this effect with
      // the same track (it shouldn't, but guard anyway), we'd briefly
      // tear down a working pipeline. The next assignment overwrites
      // safely.
    };
  }, [localCameraTrack]);

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

  /** Send one frame to /api/battle/score. Best-effort. The broadcast
   *  that fires after the call resolves drives the UI; the polling
   *  fallback below catches the case where the broadcast is dropped.
   *
   *  Retry-on-null-capture: if the off-screen video isn't ready yet
   *  (LiveKit publish race), re-attempt up to 3 times with 200ms backoff
   *  so a slow publish doesn't silently cost a score call. The retries
   *  aren't tracked in the parent's timer cleanup; if the parent
   *  unmounts mid-retry, `connected` is already false and the early
   *  return short-circuits the work. */
  const sendScoreCall = useCallback(
    async (attempt = 0): Promise<void> => {
      if (!connected) return;
      const image = captureFrame();
      if (!image) {
        if (attempt < 3) {
          window.setTimeout(() => void sendScoreCall(attempt + 1), 200);
        }
        return;
      }
      try {
        await fetch('/api/battle/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battle_id: battleId, imageBase64: image }),
        });
      } catch {
        // best-effort
      }
    },
    [battleId, captureFrame, connected],
  );

  // ---- Schedule the 10 real calls + 10 synthetic mid-calls --------
  // Gated on `localTrackReady` (not just `connected`) so timers don't
  // fire into a black off-screen video on a slow LiveKit publish — the
  // exact failure mode that produced the empty live-score card + 0
  // peak in user-reported games. When the track lands late, the schedule
  // re-runs and missed timers fire immediately (Math.max(0, …) clamp).
  useEffect(() => {
    if (!connected) return;
    if (!localTrackReady) return;
    const startMs = startedAt;
    const timers: number[] = [];

    for (let i = 0; i < REAL_CALL_COUNT; i++) {
      // First call fires PRE_FIRE_LEAD_MS BEFORE startMs so the
      // response (subject to Vertex round-trip) lands roughly when
      // the active window begins. Subsequent calls keep the 1s
      // cadence anchored to startMs.
      const fireAtMs =
        i === 0 ? startMs - PRE_FIRE_LEAD_MS : startMs + (i - 1) * REAL_INTERVAL_MS;
      const delay = Math.max(0, fireAtMs - Date.now());
      timers.push(window.setTimeout(() => void sendScoreCall(), delay));
    }

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [connected, localTrackReady, startedAt, sendScoreCall]);

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
        .then(
          (data: {
            result?: FinishPayload;
            achievements?: AchievementGrant[];
          }) => {
            if (data.result) {
              playFinishSfx(data.result);
              onFinished(data.result);
            }
            // Toast any cosmetics this battle just unlocked (25 wins,
            // 1500/1700 ELO, 7/30 win-streak). Server only fires the
            // check for the caller's user_id; opponent grants land on
            // their next checkAchievements call.
            pushAchievements(data.achievements);
          },
        )
        .catch(() => {
          // Realtime may still deliver the finish event from the other
          // participant's call; soft-fail.
        });
    }
  }, [phase, now, startedAt, battleId, onFinished, playFinishSfx]);

  // ---- Polling fallback for score updates + finished detection ------------
  // Realtime broadcasts (`score.update`, `battle.finished`) are flaky on
  // this project — the lobby's start transition already needed a polling
  // fallback for the same reason (commit 74ceeb4). This is the equivalent
  // for the active battle phase: poll /api/battle/[id]/scores every 1.5s
  // during starting/active so peak scores keep updating even when
  // broadcasts drop, and so the result screen lands when the
  // `battle.finished` broadcast is missed.
  //
  // Local `scores` state is merged via MAX — we don't pull down a
  // synthetic-jitter overall that's briefly higher than the persisted
  // peak. Server peak is the floor.
  useEffect(() => {
    if (phase !== 'starting' && phase !== 'active') return;
    let cancelled = false;
    let finishedFired = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/battle/${battleId}/scores`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          state: string;
          finished_at: string | null;
          participants: Array<{ user_id: string; peak_score: number }>;
        };

        setScores((prev) => {
          const next = { ...prev };
          for (const p of data.participants) {
            const existing = next[p.user_id];
            const newPeak = Math.max(existing?.peak ?? 0, p.peak_score);
            // For the overall display, take MAX so a local synthetic
            // higher than the server peak doesn't visibly retreat.
            // Once a real broadcast lands the overall snaps back to
            // the live value naturally.
            const newOverall = Math.max(existing?.overall ?? 0, p.peak_score);
            next[p.user_id] = {
              overall: newOverall,
              peak: newPeak,
              improvement: existing?.improvement ?? '',
            };
          }
          return next;
        });

        if (data.state === 'finished' && !finishedFired) {
          finishedFired = true;
          try {
            const fr = await fetch('/api/battle/finish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ battle_id: battleId }),
            });
            const fd = (await fr.json()) as {
              result?: FinishPayload;
              achievements?: AchievementGrant[];
            };
            if (fd.result && !cancelled) {
              playFinishSfx(fd.result);
              onFinished(fd.result);
            }
            pushAchievements(fd.achievements);
          } catch {
            // The phase-transitions effect also fires /finish locally
            // once the client clock crosses startedAt + SCAN_DURATION;
            // either path is enough to land the result.
          }
        }
      } catch {
        // Network blip — try again next tick.
      }
    };

    void tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, battleId, onFinished, playFinishSfx]);

  // ---- Camera-not-publishing warning --------------------------------------
  // If we're connected to LiveKit but the local camera track hasn't
  // landed in the off-screen video element after 4 seconds, the user's
  // score calls won't have anything to capture. Surface a banner so they
  // can refresh / regrant camera permission instead of silently scoring
  // 0 the whole battle. The 4s threshold is a buffer past normal
  // publish latency (~500-1500ms on a healthy link).
  const [cameraWarning, setCameraWarning] = useState(false);
  useEffect(() => {
    if (!connected) {
      setCameraWarning(false);
      return;
    }
    if (localTrackReady) {
      setCameraWarning(false);
      return;
    }
    const id = window.setTimeout(() => setCameraWarning(true), 4000);
    return () => window.clearTimeout(id);
  }, [connected, localTrackReady]);

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

  // Viewport-aware grid. pickGridLayout returns (rows, cols,
  // lastRowCount) — every tile in the room is rendered with the same
  // width (= viewport / cols) and same height (= viewport / rows). When
  // N has orphan slots (rows × cols > N), the last row holds fewer
  // tiles than `cols`; we anchor the row with justify-center so the
  // lone tile(s) sit in the middle with symmetric blank space on
  // either side rather than left-aligned-with-trailing-blanks. Result:
  // nobody is cramped, every face is the same size, and the only
  // visual cue that someone is "alone in their row" is the symmetric
  // breathing space around them.
  const { rows, cols, lastRowCount } = pickGridLayout(
    tracks.length,
    viewport.width,
    viewport.height,
  );
  // Effective render count: at least 2 so we never collapse to a
  // single full-screen tile while waiting for the remote track to
  // publish. Slots beyond tracks.length render a "waiting" placeholder.
  const renderCount = Math.max(2, tracks.length);
  // Pre-compute tile width as a % of the viewport so the centered last
  // row uses the same width as full rows (justify-center with flex-
  // basis ensures the tiles aren't stretched).
  const tileBasis = `${100 / cols}%`;

  return (
    <div className="relative min-h-dvh bg-black text-white">
      <TileLiquidFilter />
      <div className="flex h-dvh w-full flex-col">
        {Array.from({ length: rows }).map((_, rowIdx) => {
          const isLastRow = rowIdx === rows - 1;
          const cellsInRow = isLastRow ? lastRowCount : cols;
          const startIdx = rowIdx * cols;
          // Center the last row only when it's not full — equal to
          // `cols` means it visually IS a full row, no need to anchor.
          const needsCenter = isLastRow && lastRowCount < cols;
          return (
            <div
              key={rowIdx}
              className={`flex min-h-0 flex-1 ${
                needsCenter ? 'justify-center' : ''
              } ${isLastRow ? '' : 'border-b border-white/30'}`}
            >
              {Array.from({ length: cellsInRow }, (_, colIdx) => {
                const idx = startIdx + colIdx;
                const trackRef = idx < tracks.length ? tracks[idx] : null;
                const isWaiting = idx >= tracks.length && idx < renderCount;
                const isLastCellInRow = colIdx === cellsInRow - 1;
                const key = trackRef
                  ? `${trackRef.participant.identity}-${rowIdx}-${colIdx}`
                  : `waiting-${rowIdx}-${colIdx}`;
                if (!trackRef && !isWaiting) return null;
                if (!trackRef) {
                  return (
                    <div
                      key={key}
                      className={`relative min-w-0 overflow-hidden bg-black ${
                        isLastCellInRow ? '' : 'border-r border-white/30'
                      }`}
                      style={{ flexBasis: tileBasis, flexGrow: 0, flexShrink: 0 }}
                    >
                      <WaitingTile />
                    </div>
                  );
                }
                const userId = trackRef.participant.identity;
                const score = scores[userId];
                const hasLeft = leftUsers.has(userId);
                return (
                  <div
                    key={key}
                    className={`relative min-w-0 overflow-hidden bg-black transition-opacity duration-300 ${
                      isLastCellInRow ? '' : 'border-r border-white/30'
                    }`}
                    style={{
                      flexBasis: tileBasis,
                      flexGrow: 0,
                      flexShrink: 0,
                      opacity: hasLeft ? 0.35 : 1,
                    }}
                  >
                    {isTrackReference(trackRef) ? (
                      <VideoTrack
                        trackRef={trackRef}
                        className="h-full w-full object-cover"
                        style={
                          trackRef.participant.identity ===
                          localParticipant?.identity
                            ? { transform: 'scaleX(-1)' }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                        <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                          camera off
                        </span>
                      </div>
                    )}
                    <ScoreOverlay
                      displayName={
                        trackRef.participant.name ||
                        trackRef.participant.identity
                      }
                      score={score}
                      meta={parseMetadata(trackRef.participant.metadata)}
                    />
                    <ConnectionBars participant={trackRef.participant} />
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

      {/* Camera-not-publishing warning. Sits near the timer so the user
          can't miss it. Tells them their score calls are dead until
          they refresh — without this they'd silently score 0. */}
      {cameraWarning && (
        <div
          className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 border-2 border-red-500/80 bg-black px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-red-200"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 16px) + 40px)',
            borderRadius: 2,
          }}
          role="alert"
        >
          <span aria-hidden className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/70" />
            <span className="relative h-2 w-2 rounded-full bg-red-500" />
          </span>
          CAMERA NOT PUBLISHING · REFRESH TO RETRY
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
function WaitingTile() {
  // Placeholder for a participant slot whose camera track hasn't
  // published yet. Quiet treatment — a single pulsing dot + label so
  // the user reads "we're waiting on them" without feeling stuck.
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-center">
      <span
        aria-hidden
        className="relative inline-flex h-4 w-4"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
        <span className="relative h-4 w-4 rounded-full bg-white/85" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        waiting for opponent
      </span>
    </div>
  );
}

type GridLayout = {
  rows: number;
  cols: number;
  /** Number of tiles in the final row. Equals cols on a full row,
   *  less than cols when there are orphan slots. */
  lastRowCount: number;
};

/**
 * Viewport-aware grid picker. For N participants and the given
 * viewport, enumerate (rows, cols) candidates where rows × cols ≥ N
 * and rows × cols - N < cols (i.e. the wasted space is at most one
 * row short of full). Score each by the squared log distance of the
 * resulting tile aspect from a face-friendly target (3:4 portrait,
 * 0.75 W/H), and pick the best.
 *
 * Why log-distance: aspect ratios are multiplicative, not additive.
 * A tile at 1.5 and 0.5 are equally "off" from 1.0, but linear
 * distance would treat 0.5 as twice as bad. log() flips them onto a
 * symmetric scale.
 *
 * Why prefer face-portrait target on every viewport: even on a wide
 * desktop, each tile holds a portrait face. A tall-thin tile fits a
 * face; a wide-short tile clips the head. The picker therefore
 * prefers more columns on wide viewports and more rows on tall
 * viewports, both narrowing toward 3:4 tiles.
 *
 * Min participant = 2: when only your local track is published and
 * the others haven't joined yet, we still target the 2-slot layout
 * so a remote track landing doesn't "pop" the single tile from full
 * screen into half. Same behaviour as the old hand-tuned table.
 */
// Target tile width:height. 0.65 is a touch more portrait than 3:4 — it
// nudges the picker toward more rows / fewer cols on phone, which keeps
// faces from being clipped by landscape-ish tiles. Calibrated so:
//   N=3, 5, 7 on phone → 2-col layouts with a centered orphan
//   N=9 on phone → 3x3 Zoom-style (instead of 5x2 with one lone bottom)
//   N=4, 6, 8 on phone → uniform 2-col grid
// Adjust this constant to bias the layout in either direction.
const TARGET_TILE_ASPECT = 0.65;

function pickGridLayout(n: number, vw: number, vh: number): GridLayout {
  const effective = Math.max(2, n);
  if (effective <= 1) return { rows: 1, cols: 1, lastRowCount: 1 };

  let bestScore = Infinity;
  let best: GridLayout = { rows: effective, cols: 1, lastRowCount: 1 };

  for (let cols = 1; cols <= effective; cols++) {
    const rows = Math.ceil(effective / cols);
    // Reject layouts whose last row would be EMPTY (rows*cols >= n+cols).
    // We allow up to cols-1 orphan slots in the last row — that's the
    // case the centered-orphan rendering exists to handle.
    if (rows * cols - effective >= cols) continue;

    const tileW = vw / cols;
    const tileH = vh / rows;
    const aspect = tileW / tileH;
    if (aspect <= 0) continue;
    const score = Math.pow(Math.log(aspect / TARGET_TILE_ASPECT), 2);
    if (score < bestScore) {
      bestScore = score;
      best = {
        rows,
        cols,
        lastRowCount: effective - (rows - 1) * cols,
      };
    }
  }
  return best;
}

type Viewport = {
  width: number;
  height: number;
  isLandscape: boolean;
};

/**
 * Viewport size + orientation. Updates on resize and
 * orientationchange. SSR / first-paint defaults to a portrait phone
 * (390x844) so the grid picker has a sensible target before the
 * client measurement lands; the moment useEffect runs we swap to
 * real values.
 */
function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>({
    width: 390,
    height: 844,
    isLandscape: false,
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setVp({ width: w, height: h, isLandscape: w > h });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return vp;
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

function countdownColor(_n: number): string {
  // Brutalist redesign: countdown stays pure white regardless of digit;
  // the animation (scale-pop on swap, exit launch toward camera) carries
  // urgency without an RGB ramp. Param kept for API stability — call
  // sites still pass `n` so future re-introduction is a one-line change.
  return '#ffffff';
}

// ---- Per-tile score overlay -----------------------------------------------

// Shared SVG filter id for the liquid-glass refraction. Mounted once
// per BattleRoom render (see BattleInterior), referenced by every
// AvatarPill / ScoreCard on the page. The displacement amount is
// modest — too high and the contents of the chip warp visibly,
// breaking legibility of the score.
const TILE_LIQUID_FILTER_ID = 'mog-liquid-glass';

/**
 * Hidden SVG with the displacement-map filter used by the player
 * banner + score card backdrops. Render this exactly once per battle.
 */
function TileLiquidFilter() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      className="pointer-events-none absolute"
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      <defs>
        <filter
          id={TILE_LIQUID_FILTER_ID}
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014 0.020"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
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
  // Single substantial card on the left edge of each tile. Replaces
  // the prior 3-corner chip layout (avatar top-left + score top-right
  // + improvement bottom-right). Shows everything in one slab so the
  // eye doesn't have to triangulate three corners to read a player's
  // state: live score, tier, peak, name, weakness.
  const tier = score ? getTier(score.overall) : null;
  const color = score ? getScoreColor(score.overall) : '#a1a1aa';
  const peakColor = score ? getScoreColor(score.peak) : '#a1a1aa';
  const userStats = userStatsFromMeta(meta);

  return (
    <Link
      href={`/@${displayName}`}
      onClick={(e) => e.stopPropagation()}
      className="group absolute left-3 top-3 z-10 flex w-[180px] flex-col gap-3 bg-black px-3.5 py-3 transition-colors hover:bg-black/95"
      style={{
        border: `2px solid ${color}`,
        borderRadius: 2,
      }}
    >
      {/* Header: LIVE pip */}
      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white">
          <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
            <span
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: `${color}cc` }}
            />
            <span
              className="relative h-1.5 w-1.5 rounded-full"
              style={{ background: color }}
            />
          </span>
          LIVE SCORE
        </span>
      </div>

      {/* The big score + tier */}
      <div className="relative flex items-baseline gap-1.5">
        <span
          className="font-num font-black leading-none tabular-nums"
          style={{
            color,
            fontSize: 48,
            lineHeight: 0.92,
          }}
        >
          {score?.overall ?? '—'}
        </span>
        {tier && (
          <span
            className="font-num text-xl font-black uppercase"
            style={tierTextStyleInline(score!.overall, tier)}
          >
            {tier.letter}
          </span>
        )}
      </div>

      {/* Score-as-bar visualisation — square, no glow */}
      <div className="relative h-1 w-full bg-white/10">
        <span
          className="absolute left-0 top-0 h-full transition-all duration-500"
          style={{
            width: score ? `${Math.max(0, Math.min(100, score.overall))}%` : '0%',
            background: color,
          }}
        />
      </div>

      {/* PEAK row */}
      <div className="relative flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">
          PEAK
        </span>
        <span
          className="font-num text-base font-bold tabular-nums"
          style={{ color: peakColor }}
        >
          {score?.peak ?? '—'}
        </span>
      </div>

      {/* Divider hair */}
      <span aria-hidden className="relative h-px w-full bg-white/15" />

      {/* Player handle */}
      <div className="relative flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">
          PLAYER
        </span>
        <span className="truncate text-[14px] font-bold uppercase leading-tight text-white">
          <NameFx slug={meta.equippedNameFx ?? null} userStats={userStats}>
            {displayName}
          </NameFx>
        </span>
      </div>

      {/* Improvement (flaw) */}
      {score?.improvement && (
        <div className="relative flex items-baseline justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">
            FLAW
          </span>
          <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-white">
            {score.improvement}
          </span>
        </div>
      )}
    </Link>
  );
}

/**
 * Bottom-right connection indicator for each tile. Shows THAT
 * participant's connection quality (not the local user's) so each tile
 * tells you how the person it represents is doing — when you see your
 * opponent's video freeze, the bars on their tile go red. Three
 * staggered bars, coloured per LiveKit's quality enum.
 */
function ConnectionBars({ participant }: { participant: Participant }) {
  const { quality } = useConnectionQualityIndicator({ participant });

  // active = how many of the three bars light up
  // colour = signal colour (green / yellow / red / grey)
  let active = 0;
  let color = '#a1a1aa';
  switch (quality) {
    case ConnectionQuality.Excellent:
      active = 3;
      color = '#22c55e';
      break;
    case ConnectionQuality.Good:
      active = 2;
      color = '#facc15';
      break;
    case ConnectionQuality.Poor:
      active = 1;
      color = '#f97316';
      break;
    case ConnectionQuality.Lost:
      active = 0;
      color = '#ef4444';
      break;
    case ConnectionQuality.Unknown:
    default:
      active = 0;
      color = '#71717a';
      break;
  }

  return (
    <div
      aria-label={`connection ${quality}`}
      className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-end gap-1 rounded-full bg-black/55 px-2 py-1.5 backdrop-blur"
      style={{
        boxShadow:
          '0 4px 14px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.18)',
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-[3px] rounded-sm transition-colors"
          style={{
            height: 6 + i * 4,
            backgroundColor: i < active ? color : 'rgba(255,255,255,0.18)',
            boxShadow: i < active ? `0 0 6px ${color}88` : undefined,
          }}
        />
      ))}
    </div>
  );
}

// Inline tier-color helper for the glass score card. Same logic as the
// page-level tierTextStyle but accepts a pre-computed tier so we don't
// re-invoke getTier for the gradient check.
function tierTextStyleInline(
  score: number,
  tier: ReturnType<typeof getTier>,
): React.CSSProperties {
  // Defense-in-depth alongside the `uppercase` class on the render
  // site — body globally lowercases everything, so tier letters need
  // an explicit override here too.
  if (tier.isGradient) {
    return {
      backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textShadow: '0 0 18px rgba(168,85,247,0.4)',
      textTransform: 'uppercase',
    };
  }
  return {
    color: tier.color,
    textShadow: `0 0 14px ${getScoreColor(score)}66`,
    textTransform: 'uppercase',
  };
}

