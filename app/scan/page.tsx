'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  Home as HomeIcon,
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

type SavedResult = { scores: FinalScores; capturedImage: string; ts: number };

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
  const { user: signedInUser } = useUser();
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

      let vision: VisionScore;
      let tokensSnapshot: TokenAccum = EMPTY_TOKENS;

      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: frames.map((f) => f.image) }),
        });
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
          vision = (await res.json()) as VisionScore;
        } else {
          vision = mockVisionScore();
        }
      } catch {
        vision = mockVisionScore();
      }

      const final = combineScores(vision);

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
        if (!cancelled) dispatch({ type: 'MAPPING_DONE', scores: final });
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

  const handleRetake = useCallback(() => {
    clearSavedResult();
    dispatch({ type: 'RETAKE' });
  }, [dispatch]);

  // On first mount, hydrate from localStorage if a previous result was saved.
  // Otherwise let the camera kick in.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadSavedResult();
    if (saved) {
      dispatch({
        type: 'HYDRATE',
        scores: saved.scores,
        capturedImage: saved.capturedImage,
      });
    } else if (state.type === 'idle') {
      dispatch({ type: 'CAMERA_READY' });
    }
  }, [state.type, dispatch]);

  // Persist when entering `complete` state; clear on retake (handled in handleRetake).
  useEffect(() => {
    if (state.type === 'complete') {
      saveResult({
        scores: state.scores,
        capturedImage: state.capturedImage,
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

  return (
    <div className="relative min-h-dvh bg-black">
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
              onRetake={handleRetake}
              onShare={() => setShareOpen(true)}
              onAddToLeaderboard={() =>
                signedInUser ? setLeaderboardOpen(true) : setAuthOpen(true)
              }
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
          <AuthModal
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            context="to submit"
            next="/"
          />
        </>
      )}
    </div>
  );
}

type ResultsState =
  | { type: 'revealing'; scores: FinalScores; capturedImage: string }
  | { type: 'complete'; scores: FinalScores; capturedImage: string };

function ResultsContent({
  state,
  tokens,
  onRetake,
  onShare,
  onAddToLeaderboard,
  onRevealDone,
}: {
  state: ResultsState;
  tokens: TokenAccum;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
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
            onRetake={onRetake}
            onShare={onShare}
            onAddToLeaderboard={onAddToLeaderboard}
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
  onRetake,
  onShare,
  onAddToLeaderboard,
}: {
  scores: FinalScores;
  capturedImage: string;
  tokens: TokenAccum;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
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
            aria-label="Retake photo"
            style={{ touchAction: 'manipulation' }}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-xs font-medium text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
          >
            <RotateCcw size={14} aria-hidden />
            retake
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

      {scores.vision && typeof scores.presentation === 'number' && (
        <MoreDetail
          vision={scores.vision}
          presentation={scores.presentation}
          tokens={tokensForDetail}
        />
      )}
    </div>
  );
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
