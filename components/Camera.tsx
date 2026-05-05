'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 720 },
    height: { ideal: 1280 },
  },
};

export type CameraHandle = {
  capture: () => string | null;
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
    capture: () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const canvas = document.createElement('canvas');
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.92);
    },
  }));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
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
      className="absolute inset-0 h-full w-full object-contain"
      style={{ transform: 'scaleX(-1)' }}
    />
  );
});
