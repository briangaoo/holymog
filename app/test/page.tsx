'use client';

import { useCallback, useRef, useState } from 'react';
import { getFaceLandmarkerImage } from '@/lib/faceLandmarker';
import { extractBlendshapes, extractHeadPose } from '@/lib/mediapipeExtras';
import { combineScores, computeClientScores, mockVisionScore } from '@/lib/scoreEngine';
import type { CaptureExtras, Landmark, VisionScore } from '@/types';

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; step: string }
  | { kind: 'recorded'; name: string }
  | { kind: 'error'; message: string };

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export default function TestPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const run = useCallback(async (file: File) => {
    setStatus({ kind: 'running', step: 'reading image…' });
    try {
      const dataUrl = await blobToDataURL(file);

      setStatus({ kind: 'running', step: 'loading face detector…' });
      const detector = await getFaceLandmarkerImage();

      setStatus({ kind: 'running', step: 'detecting landmarks…' });
      const img = await loadImage(dataUrl);
      const result = detector.detect(img);
      const lm = result.faceLandmarks?.[0] as Landmark[] | undefined;
      if (!lm || lm.length !== 478) {
        throw new Error(`no face detected (landmarks: ${lm?.length ?? 0})`);
      }

      setStatus({ kind: 'running', step: 'scoring…' });
      const extras: CaptureExtras = {
        blendshapes: extractBlendshapes(result),
        headPose: extractHeadPose(result),
      };
      const { golden, proprietary } = computeClientScores(
        lm,
        img.naturalWidth,
        img.naturalHeight,
        extras,
      );

      let vision: VisionScore;
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
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

      await fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          final,
          golden,
          proprietary,
          vision,
        }),
      });

      setStatus({ kind: 'recorded', name: file.name });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void run(f);
    },
    [run],
  );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold text-white">test upload</h1>
        <p className="mb-6 text-sm text-zinc-400">
          uploads run the full pipeline. nothing is shown here — scores are written to
          the dev server log.
        </p>

        <label
          className="flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
          aria-label="Upload image"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={onFile}
            className="hidden"
            disabled={status.kind === 'running'}
          />
          {status.kind === 'running' ? status.step : 'upload image'}
        </label>

        <div className="mt-6 min-h-[24px] text-center text-sm">
          {status.kind === 'recorded' && (
            <span className="text-emerald-400">recorded! ({status.name})</span>
          )}
          {status.kind === 'error' && <span className="text-red-400">{status.message}</span>}
        </div>
      </div>
    </div>
  );
}
