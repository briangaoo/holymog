'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  Home as HomeIcon,
  Lock,
  RotateCcw,
  Share2,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Camera, type CameraHandle } from '@/components/Camera';
import { FaceDetectedPill } from '@/components/FaceDetectedPill';
import { Countdown } from '@/components/Countdown';
import { SpiderwebOverlay } from '@/components/SpiderwebOverlay';
import { ScoreReveal } from '@/components/ScoreReveal';
import { SubScoreCard } from '@/components/SubScoreCard';
import { ShareSheet } from '@/components/ShareSheet';
import { PrivacyModal } from '@/components/PrivacyModal';
import { LeaderboardButton } from '@/components/LeaderboardButton';
import { LeaderboardModal } from '@/components/LeaderboardModal';
import { AuthModal } from '@/components/AuthModal';
import { useUser } from '@/hooks/useUser';
import { LiveMeter, LivePageBorder } from '@/components/LiveMeter';
import { MoreDetail } from '@/components/MoreDetail';
import { getScoreColor } from '@/lib/scoreColor';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useFlowMachine } from '@/hooks/useFlowMachine';
import { combineScores, mockVisionScore } from '@/lib/scoreEngine';
import { prefetchLeaderboard } from '@/lib/leaderboardCache';
import { getTier, getTierDescriptor } from '@/lib/tier';
import type { FinalScores, Frame, Landmark, VisionScore } from '@/types';

// 3-second countdown → 5-second live scan phase = 8 second total scan window.
// First live call fires 1 second before the countdown ends so the result lands
// exactly when the countdown disappears (live meter appears with a score, no flash).
const COUNTDOWN_MS = 3000;
const SCAN_MS = 5000;
const TOTAL_DELAY_MS = COUNTDOWN_MS + SCAN_MS;
const WARMUP_BEFORE_END = 1000;
// 5 real Gemini calls at 1-second intervals + 5 synthetic (jittered) updates
// in between = 10 visible updates over the scan phase, but only 5 API calls.
const REAL_CALL_COUNT = 5;
const REAL_INTERVAL_MS = 1000;
const SYNTHETIC_OFFSET_MS = 500;
const TOTAL_DISPLAY_COUNT = REAL_CALL_COUNT * 2;
// Spiderweb runs during the scan phase (alongside the live meter), not during
// mapping, so mapping just waits for the heavy /api/score call to complete.
const MAPPING_MIN_MS = 0;

/** Mirror of the public `/api/scan/check` shape — sensitive internals
 *  (anon_id, ip_hash, oldest timestamps) are kept server-side. */
type ScanLimit = {
  allowed: boolean;
  used: number;
  limit: number;
  signedIn: boolean;
  reason: 'anon_lifetime' | 'auth_daily' | 'anon_ip_daily' | null;
  resetInSeconds: number | null;
};

type TokenAccum = {
  liveInput: number;
  liveOutput: number;
  liveCalls: number;
  proInput: number;
  proOutput: number;
  proCalls: number;
};

const EMPTY_TOKENS: TokenAccum = {
  liveInput: 0,
  liveOutput: 0,
  liveCalls: 0,
  proInput: 0,
  proOutput: 0,
  proCalls: 0,
};

const STORAGE_KEY = 'holymog-last-result';
const PRIVACY_KEY = 'holymog-privacy-acknowledged';

type SavedResult = {
  scores: FinalScores;
  capturedImage: string;
  ts: number;
  /**
   * Full 30-field vision payload for post-sign-in migration into
   * profile.best_scan. Optional so that pre-existing localStorage
   * entries from before this field was added still load (loadSavedResult
   * just returns them without `vision` and the migration watcher
   * skips them).
   */
  vision?: VisionScore;
};

function loadSavedResult(): SavedResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedResult>;
    if (
      !parsed.scores ||
      typeof parsed.capturedImage !== 'string' ||
      typeof parsed.scores.overall !== 'number'
    ) {
      return null;
    }
    return parsed as SavedResult;
  } catch {
    return null;
  }
}

function saveResult(result: SavedResult) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // ignore quota / private mode
  }
}

function clearSavedResult() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function Home() {
  const [state, dispatch] = useFlowMachine();
  const cameraHandleRef = useRef<CameraHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [scanLimit, setScanLimit] = useState<ScanLimit | null>(null);
  const { user: signedInUser } = useUser();
  const isSignedIn = !!signedInUser;
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 720, height: 1280 });

  // Live meter (during scan phase): score is set by real Gemini calls + synthetic
  // jitter updates in between.
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [liveDisplayCount, setLiveDisplayCount] = useState(0);
  const [tokens, setTokens] = useState<TokenAccum>(EMPTY_TOKENS);
  // Track every score already shown this scan so jitter never lands on a
  // duplicate.
  const shownScoresRef = useRef<Set<number>>(new Set());
  // Most recent REAL Gemini score, synthetic updates anchor on this so
  // they never drift far from truth.
  const lastRealScoreRef = useRef<number | null>(null);
  // Privacy gate, camera mounts immediately, but face detection / countdown
  // is paused until the user dismisses the privacy modal on first visit.
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  useEffect(() => {
    try {
      setPrivacyAcknowledged(!!window.localStorage.getItem(PRIVACY_KEY));
    } catch {
      setPrivacyAcknowledged(false);
    }
    setPrivacyChecked(true);
  }, []);

  const acknowledgePrivacy = useCallback(() => {
    try {
      window.localStorage.setItem(PRIVACY_KEY, '1');
    } catch {
      // ignore
    }
    setPrivacyAcknowledged(true);
  }, []);

  const showCamera =
    state.type === 'streaming' ||
    state.type === 'detected' ||
    state.type === 'mapping';

  const detectionActive =
    privacyAcknowledged &&
    (state.type === 'streaming' || state.type === 'detected' || state.type === 'mapping');

  const { isDetected, multipleFaces, landmarks } = useFaceDetection(
    videoRef,
    detectionActive,
  );

  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  useEffect(() => {
    if (landmarks) latestLandmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    if (state.type === 'streaming' && isDetected && !multipleFaces) {
      dispatch({ type: 'FACE_STABLE' });
    } else if (state.type === 'detected' && !isDetected) {
      dispatch({ type: 'FACE_LOST' });
    }
  }, [state.type, isDetected, multipleFaces, dispatch]);

  // Scan flow:
  //   t=0     → 'detected', countdown starts (3, 2, 1)
  //   t=2000  → real call 1 fires (warmup; result lands ~countdown end)
  //   t=3000  → countdown ends, warmup result lands → live meter appears
  //   t=3000..7500 → real calls every 1000ms + synthetic updates 500ms after
  //                  each real call. 5 real + 5 synthetic = 10 visible updates.
  //   t=4500, 6500 → 2 frames captured for the heavy /api/score call
  //   t=8000  → CAPTURE dispatched → mapping state takes over
  //   (countdown end → CAPTURE = exactly 5 seconds, no buffer)
  useEffect(() => {
    if (state.type !== 'detected') return;

    setLiveScore(null);
    setLiveDisplayCount(0);
    setTokens(EMPTY_TOKENS);
    shownScoresRef.current = new Set();
    lastRealScoreRef.current = null;

    const captured: Frame[] = [];
    const timers: number[] = [];
    let cancelled = false;

    /** Pick a value not already in the shown set, jittering ±1..2 around an anchor.
     *  Live meter displays as score/10 (e.g. 84 → "8.4"), so ±1..2 = ±0.1..0.2
     *  in the visible readout — small calm wobble, not noisy bouncing. */
    const pickUnique = (anchor: number): number => {
      const shown = shownScoresRef.current;
      let displayed = Math.max(0, Math.min(100, Math.round(anchor)));
      let attempts = 0;
      while (shown.has(displayed) && attempts < 12) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        const magnitude = 1 + Math.floor(Math.random() * 2);
        displayed = Math.max(0, Math.min(100, anchor + direction * magnitude));
        attempts++;
      }
      shown.add(displayed);
      return displayed;
    };

    // Real Gemini calls, 5 total, every 1000ms starting 1s before countdown ends.
    const firstRealAt = COUNTDOWN_MS - WARMUP_BEFORE_END; // 2000ms
    for (let i = 0; i < REAL_CALL_COUNT; i++) {
      const fireT = firstRealAt + i * REAL_INTERVAL_MS;

      timers.push(
        window.setTimeout(async () => {
          if (cancelled) return;
          const image = cameraHandleRef.current?.capture(
            latestLandmarksRef.current ?? undefined,
          );
          if (!image) return;
          try {
            const res = await fetch('/api/quick-score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: image }),
            });
            if (cancelled || !res.ok) return;
            const inTok = Number(res.headers.get('X-Tokens-Input') ?? 0);
            const outTok = Number(res.headers.get('X-Tokens-Output') ?? 0);
            const data = (await res.json()) as { overall?: number };
            if (typeof data.overall === 'number') {
              const realScore = Math.max(0, Math.min(100, Math.round(data.overall)));
              lastRealScoreRef.current = realScore;
              const displayed = pickUnique(realScore);
              setLiveScore(displayed);
              setLiveDisplayCount((c) => c + 1);
            }
            setTokens((prev) => ({
              ...prev,
              liveInput: prev.liveInput + inTok,
              liveOutput: prev.liveOutput + outTok,
              liveCalls: prev.liveCalls + 1,
            }));
          } catch {
            // best-effort
          }
        }, fireT),
      );
    }

    // Synthetic updates, fire 500ms after each real call's expected response.
    // Anchored to the most recent real score; jittered for variety.
    for (let i = 0; i < REAL_CALL_COUNT; i++) {
      const t = firstRealAt + i * REAL_INTERVAL_MS + REAL_INTERVAL_MS + SYNTHETIC_OFFSET_MS;
      // i=0 → 3500, i=1 → 4500, ..., i=4 → 7500
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          const anchor = lastRealScoreRef.current;
          if (anchor === null) return; // no real score yet, skip
          const displayed = pickUnique(anchor);
          setLiveScore(displayed);
          setLiveDisplayCount((c) => c + 1);
        }, t),
      );
    }

    // 2 frames for the heavy /api/score breakdown call.
    const heavyCaptureTimes = [
      COUNTDOWN_MS + Math.round(SCAN_MS * 0.3), // t=4500
      COUNTDOWN_MS + Math.round(SCAN_MS * 0.7), // t=6500
    ];
    for (const t of heavyCaptureTimes) {
      timers.push(
        window.setTimeout(() => {
          const lm = latestLandmarksRef.current;
          const image = cameraHandleRef.current?.capture(lm ?? undefined) ?? null;
          if (image && lm) captured.push({ image, landmarks: lm });
        }, t),
      );
    }

    // Scan phase ends EXACTLY at TOTAL_DELAY_MS (countdown + scan = 8000ms).
    const finalize = window.setTimeout(() => {
      if (captured.length === 0) {
        dispatch({ type: 'ERROR', message: 'Failed to capture any frames' });
        return;
      }
      dispatch({ type: 'CAPTURE', frames: captured });
    }, TOTAL_DELAY_MS);

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      window.clearTimeout(finalize);
    };
  }, [state.type, dispatch]);

  // Track scan phase (post-countdown) so the live meter only appears after the
  // countdown disappears.
  const [scanPhase, setScanPhase] = useState(false);
  useEffect(() => {
    if (state.type !== 'detected') {
      setScanPhase(false);
      return;
    }
    const t = window.setTimeout(() => setScanPhase(true), COUNTDOWN_MS);
    return () => window.clearTimeout(t);
  }, [state.type]);

  useEffect(() => {
    if (state.type !== 'mapping') return;
    let cancelled = false;
    const startedAt = performance.now();

    const run = async () => {
      const { frames } = state;

      let final: FinalScores;
      let vision: VisionScore | undefined;
      let tokensSnapshot: TokenAccum = EMPTY_TOKENS;

      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: frames.map((f) => f.image) }),
        });

        // Race-condition guard: limit was OK at mount but the user blew past
        // it before /api/score fired (concurrent tabs, etc). Refetch the
        // public limit state and abort the scan flow.
        if (res.status === 429) {
          void refetchScanLimit();
          dispatch({ type: 'ERROR', message: 'scan_limit_exceeded' });
          return;
        }

        if (res.ok) {
          const inTok = Number(res.headers.get('X-Tokens-Input') ?? 0);
          const outTok = Number(res.headers.get('X-Tokens-Output') ?? 0);
          setTokens((prev) => {
            tokensSnapshot = {
              ...prev,
              proInput: prev.proInput + inTok,
              proOutput: prev.proOutput + outTok,
              proCalls: prev.proCalls + frames.length * 3,
            };
            return tokensSnapshot;
          });
          const data = (await res.json()) as {
            scores: FinalScores;
            vision: VisionScore | null;
          };
          final = data.scores;
          vision = data.vision ?? undefined;
        } else {
          // Non-429 server error: fall back to mock so the UI still resolves.
          const mock = mockVisionScore();
          final = combineScores(mock);
          vision = undefined;
        }
      } catch {
        const mock = mockVisionScore();
        final = combineScores(mock);
        vision = undefined;
      }

      // Local debug log, appended to /tmp/holymog-debug.log on the server.
      void fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'main-scan',
          final,
          vision,
          tokens: tokensSnapshot,
        }),
      });

      const elapsed = performance.now() - startedAt;
      const wait = Math.max(0, MAPPING_MIN_MS - elapsed);
      window.setTimeout(() => {
        if (!cancelled) dispatch({ type: 'MAPPING_DONE', scores: final, vision });
      }, wait);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [state, dispatch, videoSize.width, videoSize.height]);

  useEffect(() => {
    const update = () =>
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleCameraReady = useCallback(() => {
    if (state.type === 'idle' || state.type === 'error') {
      dispatch({ type: 'CAMERA_READY' });
    }
  }, [state.type, dispatch]);

  const handleCameraError = useCallback(
    (message: string) => {
      dispatch({ type: 'ERROR', message });
    },
    [dispatch],
  );

  const handleVideoDimensions = useCallback((w: number, h: number) => {
    setVideoSize({ width: w, height: h });
  }, []);

  const handleRevealDone = useCallback(() => {
    dispatch({ type: 'REVEAL_DONE' });
  }, [dispatch]);

  const refetchScanLimit = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/check', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ScanLimit;
      setScanLimit(data);
    } catch {
      // best-effort; the server-side gate is still the source of truth
    }
  }, []);

  const handleRetake = useCallback(() => {
    if (scanLimit && !scanLimit.allowed) {
      // Limit exhausted — push the user toward auth instead of restarting
      // the camera. Server-side gate would reject the heavy /api/score call
      // anyway; we just save the round-trip and the wasted Gemini calls.
      setAuthOpen(true);
      return;
    }
    clearSavedResult();
    dispatch({ type: 'RETAKE' });
  }, [dispatch, scanLimit]);

  // Fetch scan-limit state on mount AND whenever auth changes (sign in/out
  // flips the user between cookie-keyed and user-keyed counters).
  useEffect(() => {
    void refetchScanLimit();
  }, [refetchScanLimit, signedInUser?.id]);

  // Refetch right after a fresh scan completes so the displayed remaining
  // count is up to date. `revealing` is the moment server-side counter
  // got incremented.
  useEffect(() => {
    if (state.type === 'revealing') {
      void refetchScanLimit();
    }
  }, [state.type, refetchScanLimit]);

  // On first mount, hydrate from localStorage if a previous result was saved.
  // Otherwise let the camera kick in — but only once we know the scan limit
  // state. Without the gate, an out-of-quota anon user would see the camera
  // turn on for a beat before the paywall paints.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (scanLimit === null) return;
    hydratedRef.current = true;
    const saved = loadSavedResult();
    if (saved) {
      dispatch({
        type: 'HYDRATE',
        scores: saved.scores,
        capturedImage: saved.capturedImage,
        vision: saved.vision,
      });
    } else if (state.type === 'idle' && scanLimit.allowed) {
      dispatch({ type: 'CAMERA_READY' });
    }
    // else: stay 'idle', the paywall view below renders
  }, [state.type, dispatch, scanLimit]);

  // Persist when entering `complete` state; clear on retake (handled in handleRetake).
  // The `vision` payload (when present) is what the post-sign-in
  // migration watcher reads to lift the scan into profile.best_scan.
  useEffect(() => {
    if (state.type === 'complete') {
      saveResult({
        scores: state.scores,
        capturedImage: state.capturedImage,
        vision: state.vision,
        ts: Date.now(),
      });
    }
  }, [state]);

  // Warm the leaderboard cache the moment the scan finishes, so opening the
  // /leaderboard page is instant.
  useEffect(() => {
    if (state.type !== 'complete') return;
    void prefetchLeaderboard();
  }, [state.type]);

  const showHint = state.type === 'streaming' && !multipleFaces && !isDetected;
  const showFaceCountWarning = state.type === 'streaming' && multipleFaces;
  const showResults = state.type === 'revealing' || state.type === 'complete';
  const limitExhausted = scanLimit !== null && !scanLimit.allowed;
  // Show the dedicated paywall view when there's no cached result to fall
  // back to — once the user has cached output they see that instead, with
  // the retake button gated.
  const showPaywall = limitExhausted && state.type === 'idle';

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      {/* Subtle emerald ambient — scan's brand colour. Sits below the
          fixed-position camera/results layers so the wash is always
          visible at the page edges (paywall view, the brief idle gap)
          without competing with tier-tinted result colours which paint
          their own backdrop on top. */}
      <span
        aria-hidden
        className="pointer-events-none fixed -top-32 -left-32 h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(34,197,94,0.05) 35%, transparent 70%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(5,150,105,0.10) 0%, transparent 60%)',
        }}
      />

      <PrivacyModal
        open={privacyChecked && !privacyAcknowledged}
        onAcknowledge={acknowledgePrivacy}
      />

      {/* Wordmark, subtle, only visible during camera and at top of results */}
      <header
        className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <Image
          src="/logo-wordmark.png"
          alt="holymog"
          width={120}
          height={29}
          priority
          className="h-5 w-auto rounded-md drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
        />
      </header>

      {showPaywall && (
        <ScanPaywall
          scanLimit={scanLimit}
          onSignIn={() => setAuthOpen(true)}
        />
      )}

      {/* Full-screen camera, fixed inset-0 covers the entire viewport on every device */}
      {showCamera && (
        <div className="fixed inset-0 z-10 overflow-hidden bg-black">
          <Camera
            ref={cameraHandleRef}
            videoRef={videoRef}
            enabled
            onReady={handleCameraReady}
            onError={handleCameraError}
            onDimensions={handleVideoDimensions}
          />

          <FaceDetectedPill visible={state.type === 'detected'} />

          {state.type === 'detected' && !scanPhase && (
            <Countdown durationMs={COUNTDOWN_MS} />
          )}

          {/* Live meter + page border stay up from scan-phase start through
              the mapping/API call until the reveal page appears. */}
          <LiveMeter
            score={liveScore}
            visible={scanPhase || state.type === 'mapping'}
            progress={liveDisplayCount}
            total={TOTAL_DISPLAY_COUNT}
          />
          <LivePageBorder
            color={
              (scanPhase || state.type === 'mapping') && liveScore !== null
                ? getScoreColor(liveScore)
                : null
            }
          />

          {/* Spiderweb runs alongside the live bar (5 seconds during scan
              phase) and stays visible into the mapping phase while the heavy
              call resolves. */}
          {(scanPhase || state.type === 'mapping') &&
            screenSize.width > 0 &&
            (landmarks ||
              (state.type === 'mapping' &&
                state.frames[state.frames.length - 1]?.landmarks)) && (
              <SpiderwebOverlay
                landmarks={
                  (landmarks as Landmark[] | null) ??
                  ((state.type === 'mapping'
                    ? state.frames[state.frames.length - 1]?.landmarks
                    : null) as Landmark[])
                }
                containerWidth={screenSize.width}
                containerHeight={screenSize.height}
                videoWidth={videoSize.width}
                videoHeight={videoSize.height}
                visible
              />
            )}

          <AnimatePresence>
            {showHint && (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-x-0 z-20 text-center text-sm text-white/70"
                style={{ bottom: 'max(env(safe-area-inset-bottom), 32px)' }}
              >
                look at the camera
              </motion.p>
            )}
          </AnimatePresence>

          {showFaceCountWarning && (
            <div
              className="absolute inset-x-6 z-20 rounded-xl bg-black/70 px-3 py-2 text-center text-xs text-white"
              style={{ bottom: 'max(env(safe-area-inset-bottom), 32px)' }}
            >
              one face at a time
            </div>
          )}
        </div>
      )}

      {state.type === 'error' && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="text-base text-white">camera unavailable</p>
          <p className="mt-2 text-sm text-zinc-500">{state.message}</p>
        </div>
      )}

      {/* Results layer, full-screen, tier-tinted backdrop */}
      <AnimatePresence>
        {showResults && (
          <motion.main
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-20 flex min-h-dvh w-full flex-col items-center bg-black"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 56px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
            }}
          >
            <ResultsContent
              state={state}
              tokens={tokens}
              signedIn={isSignedIn}
              retakeLocked={limitExhausted}
              onRetake={handleRetake}
              onShare={() => setShareOpen(true)}
              onAddToLeaderboard={() =>
                signedInUser ? setLeaderboardOpen(true) : setAuthOpen(true)
              }
              onSignIn={() => setAuthOpen(true)}
              onRevealDone={handleRevealDone}
            />
          </motion.main>
        )}
      </AnimatePresence>

      {state.type === 'complete' && (
        <>
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            score={state.scores.overall}
          />
          <LeaderboardModal
            open={leaderboardOpen}
            scores={state.scores}
            capturedImage={state.capturedImage}
            onClose={() => setLeaderboardOpen(false)}
          />
        </>
      )}

      {/* AuthModal is mounted at all times so the paywall view, the
          retake-locked button, and the locked breakdown can each pop it. */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        context="for unlimited"
        next="/scan"
      />
    </div>
  );
}

type ResultsState =
  | { type: 'revealing'; scores: FinalScores; capturedImage: string }
  | { type: 'complete'; scores: FinalScores; capturedImage: string };

function ResultsContent({
  state,
  tokens,
  signedIn,
  retakeLocked,
  onRetake,
  onShare,
  onAddToLeaderboard,
  onSignIn,
  onRevealDone,
}: {
  state: ResultsState;
  tokens: TokenAccum;
  signedIn: boolean;
  retakeLocked: boolean;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
  onSignIn: () => void;
  onRevealDone: () => void;
}) {
  const tier = getTier(state.scores.overall);

  // subtle radial tier-color glow behind the tier letter, anchors color identity
  const ambientStyle = useMemo<React.CSSProperties>(() => {
    const accent = tier.isGradient ? '#a855f7' : tier.color;
    return {
      backgroundImage: `radial-gradient(circle at 50% 32%, ${accent}24, rgba(0,0,0,0) 55%)`,
    };
  }, [tier.color, tier.isGradient]);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={ambientStyle}
      />

      <div className="relative z-10 flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-5">
        {state.type === 'revealing' ? (
          <ScoreReveal
            scores={state.scores}
            capturedImage={state.capturedImage}
            onRevealDone={onRevealDone}
          />
        ) : (
          <CompleteView
            scores={state.scores}
            capturedImage={state.capturedImage}
            tokens={tokens}
            signedIn={signedIn}
            retakeLocked={retakeLocked}
            onRetake={onRetake}
            onShare={onShare}
            onAddToLeaderboard={onAddToLeaderboard}
            onSignIn={onSignIn}
          />
        )}
      </div>
    </>
  );
}

function CompleteView({
  scores,
  capturedImage,
  tokens,
  signedIn,
  retakeLocked,
  onRetake,
  onShare,
  onAddToLeaderboard,
  onSignIn,
}: {
  scores: FinalScores;
  capturedImage: string;
  tokens: TokenAccum;
  signedIn: boolean;
  retakeLocked: boolean;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
  onSignIn: () => void;
}) {
  const tokensForDetail = tokens.liveCalls + tokens.proCalls > 0 ? tokens : undefined;
  const tier = getTier(scores.overall);
  const descriptor = getTierDescriptor(tier.letter);
  const descriptorColor = tier.isGradient ? '#a855f7' : tier.color;
  const accent = tier.isGradient ? '#a855f7' : tier.color;

  const letterStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textShadow: tier.glow ? '0 0 60px rgba(168,85,247,0.55)' : undefined,
        filter: tier.glow ? 'drop-shadow(0 0 36px rgba(34,211,238,0.45))' : undefined,
      }
    : { color: tier.color };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Avatar src={capturedImage} accent={tier.color} isGradient={tier.isGradient} />

      <div
        className="font-num leading-none normal-case"
        style={{ fontSize: 'clamp(180px, 50vw, 380px)', fontWeight: 900, ...letterStyle }}
      >
        {tier.letter}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className="font-num font-extrabold text-white"
          style={{ fontSize: 'clamp(52px, 14vw, 80px)', lineHeight: 1 }}
        >
          {scores.overall}
        </div>
        <div
          className="text-sm font-medium lowercase tracking-wide"
          style={{ color: descriptorColor, opacity: 0.95 }}
        >
          {descriptor}
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        <SubScoreCard label="Jawline" finalValue={scores.sub.jawline} animate={false} />
        <SubScoreCard label="Eyes" finalValue={scores.sub.eyes} animate={false} />
        <SubScoreCard label="Skin" finalValue={scores.sub.skin} animate={false} />
        <SubScoreCard
          label="Cheekbones"
          finalValue={scores.sub.cheekbones}
          animate={false}
        />
      </div>

      {/* Two rows: Share is the primary action (full-width white pill);
          retake / home / account share a tighter secondary row beneath. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex w-full flex-col gap-4 pt-1"
      >
        <button
          type="button"
          onClick={onShare}
          aria-label="Share your tier"
          style={{ touchAction: 'manipulation' }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
        >
          <Share2 size={16} aria-hidden />
          share
        </button>

        <div className="grid w-full grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onRetake}
            aria-label={retakeLocked ? 'Sign in to scan again' : 'Retake photo'}
            style={{ touchAction: 'manipulation' }}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-xs font-medium text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
          >
            {retakeLocked ? (
              <>
                <Lock size={13} aria-hidden />
                sign in
              </>
            ) : (
              <>
                <RotateCcw size={14} aria-hidden />
                retake
              </>
            )}
          </button>
          <Link
            href="/"
            aria-label="Go home"
            style={{ touchAction: 'manipulation' }}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-xs font-medium text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
          >
            <HomeIcon size={14} aria-hidden />
            home
          </Link>
          <Link
            href="/account"
            aria-label="Go to account"
            style={{ touchAction: 'manipulation' }}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-xs font-medium text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
          >
            <UserRound size={14} aria-hidden />
            account
          </Link>
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-2 pt-1">
        <LeaderboardButton onClick={onAddToLeaderboard} accent={accent} />
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-white"
        >
          <Trophy size={12} aria-hidden />
          view leaderboard
        </Link>
      </div>

      {typeof scores.presentation === 'number' && (
        <MoreDetail
          vision={scores.vision}
          presentation={scores.presentation}
          tokens={tokensForDetail}
          signedIn={signedIn}
          onSignIn={onSignIn}
        />
      )}
    </div>
  );
}

/**
 * Full-page paywall shown when the scan limit is exhausted and the user has
 * no cached previous result to fall back to. This is a fenced "you must sign
 * in to continue" wall — not a modal, since the underlying state is `idle`
 * with no UI of its own.
 */
function ScanPaywall({
  scanLimit,
  onSignIn,
}: {
  scanLimit: ScanLimit | null;
  onSignIn: () => void;
}) {
  const reason = scanLimit?.reason ?? 'anon_lifetime';
  const headline =
    reason === 'auth_daily'
      ? "you've hit today's scan limit"
      : "you've used your free scan";
  const sub =
    reason === 'auth_daily'
      ? formatReset(scanLimit?.resetInSeconds ?? null)
      : 'sign in to keep scanning. accounts get 10 scans / day.';
  const showSignIn = reason !== 'auth_daily';

  return (
    <main className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <Lock size={18} className="text-zinc-200" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold text-white">{headline}</h1>
      <p className="mt-2 max-w-xs text-sm text-zinc-400">{sub}</p>
      <div className="mt-6 flex flex-col gap-2">
        {showSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            style={{ touchAction: 'manipulation' }}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-100"
          >
            sign in / sign up
          </button>
        )}
        <Link
          href="/"
          className="rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          go home
        </Link>
      </div>
    </main>
  );
}

function formatReset(secs: number | null): string {
  if (secs === null || secs <= 0) {
    return "you've reached today's limit. come back soon.";
  }
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) {
    return `your next scan unlocks in ${hours}h ${minutes}m.`;
  }
  return `your next scan unlocks in ${Math.max(1, minutes)}m.`;
}

function Avatar({
  src,
  accent,
  isGradient,
}: {
  src: string;
  accent: string;
  isGradient: boolean;
}) {
  const ringStyle: React.CSSProperties = isGradient
    ? { background: 'conic-gradient(from 90deg, #22d3ee, #a855f7, #22d3ee)' }
    : { background: accent };
  return (
    <div className="relative h-14 w-14 rounded-full p-[1.5px]" style={ringStyle}>
      <div className="h-full w-full overflow-hidden rounded-full bg-black">
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}
