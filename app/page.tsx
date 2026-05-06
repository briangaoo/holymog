'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Share2, Trophy } from 'lucide-react';
import { Camera, type CameraHandle } from '@/components/Camera';
import { FaceDetectedPill } from '@/components/FaceDetectedPill';
import { Countdown } from '@/components/Countdown';
import { SpiderwebOverlay, SPIDERWEB_TOTAL_MS } from '@/components/SpiderwebOverlay';
import { ScoreReveal } from '@/components/ScoreReveal';
import { SubScoreCard } from '@/components/SubScoreCard';
import { ShareSheet } from '@/components/ShareSheet';
import { RetakeButton } from '@/components/RetakeButton';
import { PrivacyModal } from '@/components/PrivacyModal';
import { LeaderboardButton } from '@/components/LeaderboardButton';
import { LeaderboardModal } from '@/components/LeaderboardModal';
import { MoreDetail } from '@/components/MoreDetail';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useFlowMachine } from '@/hooks/useFlowMachine';
import { combineScores, computeClientScores, mockVisionScore } from '@/lib/scoreEngine';
import { getTier, getTierDescriptor } from '@/lib/tier';
import type { Blendshapes, CaptureExtras, FinalScores, HeadPose, Landmark, VisionScore } from '@/types';

const CAPTURE_DELAY_MS = 3000;
const MAPPING_MIN_MS = SPIDERWEB_TOTAL_MS;

const STORAGE_KEY = 'mogem-last-result';
const PRIVACY_KEY = 'mogem-privacy-acknowledged';

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
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 720, height: 1280 });
  // Privacy gate — camera mounts immediately, but face detection / countdown
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

  const { isDetected, multipleFaces, landmarks, blendshapes, headPose } =
    useFaceDetection(videoRef, detectionActive);

  const latestDetectionRef = useRef<{
    landmarks: Landmark[] | null;
    blendshapes: Blendshapes | null;
    headPose: HeadPose | null;
  }>({ landmarks: null, blendshapes: null, headPose: null });
  useEffect(() => {
    if (landmarks) {
      latestDetectionRef.current = {
        landmarks,
        blendshapes: blendshapes ?? latestDetectionRef.current.blendshapes,
        headPose: headPose ?? latestDetectionRef.current.headPose,
      };
    }
  }, [landmarks, blendshapes, headPose]);

  useEffect(() => {
    if (state.type === 'streaming' && isDetected && !multipleFaces) {
      dispatch({ type: 'FACE_STABLE' });
    } else if (state.type === 'detected' && !isDetected) {
      dispatch({ type: 'FACE_LOST' });
    }
  }, [state.type, isDetected, multipleFaces, dispatch]);

  useEffect(() => {
    if (state.type !== 'detected') return;
    const timeout = window.setTimeout(() => {
      const image = cameraHandleRef.current?.capture() ?? null;
      const det = latestDetectionRef.current;
      if (!image || !det.landmarks || !det.blendshapes || !det.headPose) {
        dispatch({ type: 'ERROR', message: 'Failed to capture frame' });
        return;
      }
      const extras: CaptureExtras = {
        blendshapes: det.blendshapes,
        headPose: det.headPose,
      };
      dispatch({ type: 'CAPTURE', image, landmarks: det.landmarks, extras });
    }, CAPTURE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [state.type, dispatch]);

  useEffect(() => {
    if (state.type !== 'mapping') return;
    let cancelled = false;
    const startedAt = performance.now();

    const run = async () => {
      const { golden, proprietary } = computeClientScores(
        state.landmarks,
        videoSize.width,
        videoSize.height,
        state.extras,
      );

      let vision: VisionScore;
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: state.capturedImage }),
        });
        if (res.ok) {
          vision = (await res.json()) as VisionScore;
        } else {
          const data = (await res.json().catch(() => ({}))) as { fallback?: VisionScore };
          vision = data.fallback ?? mockVisionScore();
        }
      } catch {
        vision = mockVisionScore();
      }

      const final = combineScores(golden, proprietary, vision);

      // Local debug log — appended to /tmp/mogem-debug.log on the server.
      // Diff entries to see why one capture scored higher than another.
      void fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'main-scan',
          final,
          golden,
          proprietary,
          vision,
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

  const showHint = state.type === 'streaming' && !multipleFaces && !isDetected;
  const showFaceCountWarning = state.type === 'streaming' && multipleFaces;
  const showResults = state.type === 'revealing' || state.type === 'complete';

  return (
    <div className="relative min-h-dvh bg-black">
      <PrivacyModal
        open={privacyChecked && !privacyAcknowledged}
        onAcknowledge={acknowledgePrivacy}
      />

      {/* Wordmark — subtle, only visible during camera and at top of results */}
      <header
        className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <span className="font-mono text-sm lowercase text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          mogem
        </span>
      </header>

      {/* Full-screen camera — fixed inset-0 covers the entire viewport on every device */}
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

          {state.type === 'detected' && <Countdown durationMs={CAPTURE_DELAY_MS} />}

          {state.type === 'mapping' && screenSize.width > 0 && (
            <SpiderwebOverlay
              landmarks={(landmarks as Landmark[] | null) ?? (state.landmarks as Landmark[])}
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

      {/* Results layer — full-screen, tier-tinted backdrop */}
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
              onRetake={handleRetake}
              onShare={() => setShareOpen(true)}
              onAddToLeaderboard={() => setLeaderboardOpen(true)}
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
    </div>
  );
}

type ResultsState =
  | { type: 'revealing'; scores: FinalScores; capturedImage: string }
  | { type: 'complete'; scores: FinalScores; capturedImage: string };

function ResultsContent({
  state,
  onRetake,
  onShare,
  onAddToLeaderboard,
  onRevealDone,
}: {
  state: ResultsState;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
  onRevealDone: () => void;
}) {
  const tier = getTier(state.scores.overall);

  // subtle radial tier-color glow behind the tier letter — anchors color identity
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
  onRetake,
  onShare,
  onAddToLeaderboard,
}: {
  scores: FinalScores;
  capturedImage: string;
  onRetake: () => void;
  onShare: () => void;
  onAddToLeaderboard: () => void;
}) {
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
        className="font-num leading-none"
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

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex w-full gap-3 pt-1"
      >
        <RetakeButton onClick={onRetake} />
        <button
          type="button"
          onClick={onShare}
          aria-label="Share your tier"
          style={{ touchAction: 'manipulation' }}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
        >
          <Share2 size={16} aria-hidden />
          Share
        </button>
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
        <MoreDetail vision={scores.vision} presentation={scores.presentation} />
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
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>
    </div>
  );
}
