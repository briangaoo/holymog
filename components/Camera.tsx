'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Landmark } from '@/types';

const MIN_DIM = 256;

/**
 * Compute a face-centred crop box from MediaPipe landmarks. The bbox of all
 * 478 points is expanded with extra padding above (for hair) and to the sides
 * (for ears), and a smaller pad below (chin/neck). Ensures each dimension is
 * at least MIN_DIM so the result passes /api/score validation.
 */
function computeFaceCrop(
  landmarks: Landmark[],
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const fx = minX * imgW;
  const fy = minY * imgH;
  const fw = (maxX - minX) * imgW;
  const fh = (maxY - minY) * imgH;
  const padTop = fh * 0.55;
  const padBottom = fh * 0.25;
  const padSide = fw * 0.4;
  let x = Math.max(0, fx - padSide);
  let y = Math.max(0, fy - padTop);
  let x2 = Math.min(imgW, fx + fw + padSide);
  let y2 = Math.min(imgH, fy + fh + padBottom);

  // Ensure both dims ≥ MIN_DIM by expanding around the centre.
  const expand = (lo: number, hi: number, max: number, min: number): [number, number] => {
    const cur = hi - lo;
    if (cur >= min) return [lo, hi];
    const c = (lo + hi) / 2;
    let nlo = Math.max(0, c - min / 2);
    let nhi = Math.min(max, nlo + min);
    if (nhi - nlo < min) nlo = Math.max(0, nhi - min);
    return [nlo, nhi];
  };
  [x, x2] = expand(x, x2, imgW, MIN_DIM);
  [y, y2] = expand(y, y2, imgH, MIN_DIM);

  return { x, y, w: x2 - x, h: y2 - y };
}

function buildConstraints(): MediaStreamConstraints {
  // Match the camera resolution to the viewport orientation so object-cover
  // only does a small crop instead of a 2-3× scale-up.
  const portrait =
    typeof window === 'undefined' ? true : window.innerHeight >= window.innerWidth;
  return {
    audio: false,
    video: portrait
      ? {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 9 / 16 },
        }
      : {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
        },
  };
}

export type CameraHandle = {
  /** Capture the current video frame as a JPEG data URL. If `landmarks` are
   *  passed, the frame is cropped to a face-centred bounding box (with hair /
   *  ear / chin padding) so that only the detected person is sent to vision. */
  capture: (landmarks?: Landmark[]) => string | null;
};

type Props = {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onDimensions?: (w: number, h: number) => void;
};

export const Camera = forwardRef<CameraHandle, Props>(function Camera(
  { enabled, videoRef, onReady, onError, onDimensions },
  ref,
) {
  const streamRef = useRef<MediaStream | null>(null);
  const [, setIsReady] = useState(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onDimensionsRef = useRef(onDimensions);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onDimensionsRef.current = onDimensions;
  }, [onReady, onError, onDimensions]);

  useImperativeHandle(ref, () => ({
    capture: (landmarks?: Landmark[]) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w <= 0 || h <= 0) return null;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Mirror horizontally so the saved frame matches the (mirrored) camera
      // preview the user just saw. With this, no display surface needs a CSS
      // flip — they all show the captured bytes as-is and stay consistent.
      if (landmarks && landmarks.length === 478) {
        const c = computeFaceCrop(landmarks, w, h);
        canvas.width = Math.round(c.w);
        canvas.height = Math.round(c.h);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      } else {
        canvas.width = w;
        canvas.height = h;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
      }
      return canvas.toDataURL('image/jpeg', 0.92);
    },
  }));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildConstraints());
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          await video.play().catch(() => {});
          const reportDims = () => {
            if (video.videoWidth && video.videoHeight) {
              onDimensionsRef.current?.(video.videoWidth, video.videoHeight);
            }
          };
          if (video.readyState >= 1) reportDims();
          else video.addEventListener('loadedmetadata', reportDims, { once: true });
          setIsReady(true);
          onReadyRef.current?.();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Camera access denied';
        onErrorRef.current?.(message);
      }
    })();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, videoRef]);

  return (
    <video
      ref={videoRef}
      playsInline
      muted
      autoPlay
      aria-label="Live camera feed showing your face"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: 'scaleX(-1)' }}
    />
  );
});
