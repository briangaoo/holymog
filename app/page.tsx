'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { Camera, type CameraHandle } from '@/components/Camera';
import { FaceDetectedPill } from '@/components/FaceDetectedPill';
import { Countdown } from '@/components/Countdown';
import { SpiderwebOverlay, SPIDERWEB_TOTAL_MS } from '@/components/SpiderwebOverlay';
import { ScoreReveal } from '@/components/ScoreReveal';
import { ShareSheet } from '@/components/ShareSheet';
import { RetakeButton } from '@/components/RetakeButton';
import { PrivacyModal } from '@/components/PrivacyModal';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useFlowMachine } from '@/hooks/useFlowMachine';
import { combineScores, computeClientScores, mockVisionScore } from '@/lib/scoreEngine';
import { getTier } from '@/lib/tier';
import type { FinalScores, Landmark, VisionScore } from '@/types';

const CAPTURE_DELAY_MS = 3000;
const MAPPING_MIN_MS = SPIDERWEB_TOTAL_MS;

export default function Home() {
  const [state, dispatch] = useFlowMachine();
  const cameraHandleRef = useRef<CameraHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 720, height: 1280 });

  const showCamera =
    state.type === 'streaming' ||
    state.type === 'detected' ||
    state.type === 'mapping';

  const detectionActive =
    state.type === 'streaming' || state.type === 'detected' || state.type === 'mapping';

  const { isDetected, multipleFaces, landmarks } = useFaceDetection(
    videoRef,
    detectionActive,
  );

  // Latest landmarks ref — read at capture time, but does NOT cause effect re-runs
  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  useEffect(() => {
    if (landmarks) latestLandmarksRef.current = landmarks;
  }, [landmarks]);

  // streaming → detected
  useEffect(() => {
    if (state.type === 'streaming' && isDetected && !multipleFaces) {
      dispatch({ type: 'FACE_STABLE' });
    } else if (state.type === 'detected' && !isDetected) {
      dispatch({ type: 'FACE_LOST' });
    }
  }, [state.type, isDetected, multipleFaces, dispatch]);

  // detected → capture after CAPTURE_DELAY_MS (no landmarks dep so timer doesn't reset)
  useEffect(() => {
    if (state.type !== 'detected') return;
    const timeout = window.setTimeout(() => {
      const image = cameraHandleRef.current?.capture() ?? null;
      const lm = latestLandmarksRef.current;
      if (!image || !lm) {
        dispatch({ type: 'ERROR', message: 'Failed to capture frame' });
        return;
      }
      dispatch({ type: 'CAPTURE', image, landmarks: lm });
    }, CAPTURE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [state.type, dispatch]);

  // mapping: client scoring + vision API + min animation duration
  useEffect(() => {
    if (state.type !== 'mapping') return;
    let cancelled = false;
    const startedAt = performance.now();

    const run = async () => {
      const { golden, proprietary } = computeClientScores(
        state.landmarks,
        videoSize.width,
        videoSize.height,
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
          const data = (await res.json().catch(() => ({}))) as {
            fallback?: VisionScore;
          };
          vision = data.fallback ?? mockVisionScore();
        }
      } catch {
        vision = mockVisionScore();
      }

      const final = combineScores(golden, proprietary, vision);
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
  }, [state, dispatch]);

  // Track screen size for spiderweb SVG
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
    dispatch({ type: 'RETAKE' });
  }, [dispatch]);

  useEffect(() => {
    if (state.type === 'idle') dispatch({ type: 'CAMERA_READY' });
  }, [state.type, dispatch]);

  const finalScores: FinalScores | null =
    state.type === 'revealing' || state.type === 'complete' ? state.scores : null;

  const showHint = state.type === 'streaming' && !multipleFaces && !isDetected;
  const showFaceCountWarning = state.type === 'streaming' && multipleFaces;
  const showResults = state.type === 'revealing' || state.type === 'complete';

  return (
    <div className="relative min-h-dvh bg-black">
      <PrivacyModal />

      {/* Always-visible wordmark */}
      <header
        className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <span className="font-mono text-sm lowercase text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          mogem
        </span>
      </header>

      {/* Full-screen camera layer */}
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

      {/* Error overlay (full-screen) */}
      {state.type === 'error' && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="text-base text-white">camera unavailable</p>
          <p className="mt-2 text-sm text-zinc-500">{state.message}</p>
        </div>
      )}

      {/* Results layer (no camera) */}
      <AnimatePresence>
        {showResults && finalScores && (
          <motion.main
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-20 flex min-h-dvh w-full flex-col items-center bg-black"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 60px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
            }}
          >
            <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-5">
              {state.type === 'revealing' ? (
                <ScoreReveal scores={finalScores} onRevealDone={handleRevealDone} />
              ) : (
                <CompleteView
                  scores={finalScores}
                  onRetake={handleRetake}
                  onShare={() => setShareOpen(true)}
                />
              )}
            </div>
          </motion.main>
        )}
      </AnimatePresence>

      {finalScores && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          score={finalScores.overall}
        />
      )}
    </div>
  );
}

function CompleteView({
  scores,
  onRetake,
  onShare,
}: {
  scores: FinalScores;
  onRetake: () => void;
  onShare: () => void;
}) {
  const tier = getTier(scores.overall);
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
    <div className="flex w-full flex-col items-center gap-8">
      <div
        className="font-sans leading-none"
        style={{ fontSize: 'clamp(180px, 56vw, 420px)', fontWeight: 900, ...letterStyle }}
      >
        {tier.letter}
      </div>
      <div
        className="font-mono font-semibold tabular-nums text-white"
        style={{ fontSize: 'clamp(56px, 16vw, 96px)', lineHeight: 1 }}
      >
        {scores.overall}
      </div>
      <div className="grid w-full grid-cols-2 gap-3">
        <SubScoreStatic label="Jawline" value={scores.sub.jawline} />
        <SubScoreStatic label="Eyes" value={scores.sub.eyes} />
        <SubScoreStatic label="Skin" value={scores.sub.skin} />
        <SubScoreStatic label="Cheekbones" value={scores.sub.cheekbones} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex w-full gap-3 pt-2"
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
    </div>
  );
}

function SubScoreStatic({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-[160px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </div>
      <div className="flex flex-1 items-end justify-center">
        <span
          className="font-mono font-semibold tabular-nums text-white"
          style={{
            fontSize: 'clamp(40px, 12vw, 64px)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
