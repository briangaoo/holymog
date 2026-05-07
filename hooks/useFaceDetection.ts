'use client';

import { useEffect, useRef, useState } from 'react';
import { getFaceLandmarker } from '@/lib/faceLandmarker';
import type { Landmark } from '@/types';

const STABLE_FRAMES_REQUIRED = 3;

type DetectionState = {
  isDetected: boolean;
  multipleFaces: boolean;
  landmarks: Landmark[] | null;
};

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): DetectionState {
  const [state, setState] = useState<DetectionState>({
    isDetected: false,
    multipleFaces: false,
    landmarks: null,
  });
  const stableFramesRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const frameToggleRef = useRef(false);
  const lastVideoTsRef = useRef(-1);

  useEffect(() => {
    if (!enabled) {
      stableFramesRef.current = 0;
      setState({ isDetected: false, multipleFaces: false, landmarks: null });
      return;
    }

    let cancelled = false;
    let detector: Awaited<ReturnType<typeof getFaceLandmarker>> | null = null;

    (async () => {
      try {
        detector = await getFaceLandmarker();
      } catch {
        return;
      }
      if (cancelled) return;

      const tick = () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !detector) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        frameToggleRef.current = !frameToggleRef.current;
        if (!frameToggleRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const ts = performance.now();
        if (ts === lastVideoTsRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastVideoTsRef.current = ts;

        try {
          const result = detector.detectForVideo(video, ts);
          const faces = result.faceLandmarks ?? [];
          if (faces.length === 0 || faces[0].length !== 478) {
            stableFramesRef.current = 0;
            setState((prev) =>
              prev.isDetected || prev.multipleFaces
                ? { isDetected: false, multipleFaces: false, landmarks: null }
                : prev,
            );
          } else if (faces.length > 1) {
            stableFramesRef.current = 0;
            setState({ isDetected: false, multipleFaces: true, landmarks: null });
          } else {
            stableFramesRef.current += 1;
            const lm = faces[0] as Landmark[];
            if (stableFramesRef.current >= STABLE_FRAMES_REQUIRED) {
              setState({ isDetected: true, multipleFaces: false, landmarks: lm });
            } else {
              setState((prev) =>
                prev.multipleFaces
                  ? { isDetected: false, multipleFaces: false, landmarks: lm }
                  : { ...prev, landmarks: lm },
              );
            }
          }
        } catch {
          // ignore single-frame errors
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, videoRef]);

  return state;
}
