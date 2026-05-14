'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Landmark } from '@/types';

const FACE_OUTLINE = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
];
const LEFT_BROW = [70, 63, 105, 66, 107];
const RIGHT_BROW = [336, 296, 334, 293, 300];
const NOSE = [1, 2, 5, 4, 6, 19, 94, 168];
const LIPS = [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318];
const JAW = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397];

const CROSS_PAIRS: Array<[number, number]> = [
  [468, 473],
  [49, 279],
  [61, 291],
  [152, 10],
  [133, 362],
];

type Group = {
  name: string;
  indices: number[];
  start: number;
  end: number;
  closed?: boolean;
};

// 5-second animation matching the live-scan phase duration.
const GROUPS: Group[] = [
  { name: 'face', indices: FACE_OUTLINE, start: 0.0, end: 1.4, closed: true },
  { name: 'leftEye', indices: LEFT_EYE, start: 0.9, end: 2.3, closed: true },
  { name: 'rightEye', indices: RIGHT_EYE, start: 0.9, end: 2.3, closed: true },
  { name: 'leftBrow', indices: LEFT_BROW, start: 0.9, end: 2.3 },
  { name: 'rightBrow', indices: RIGHT_BROW, start: 0.9, end: 2.3 },
  { name: 'nose', indices: NOSE, start: 1.8, end: 3.0 },
  { name: 'lips', indices: LIPS, start: 2.5, end: 3.7, closed: true },
  { name: 'jaw', indices: JAW, start: 3.2, end: 4.4 },
];

const LINE_DURATION_MS = 500;
const TOTAL_MS = 5000;
const FADE_OUT_MS = 300;
const CROSS_START_MS = 3800;
const CROSS_END_MS = 4900;

// Medium-green vibrant overlay — the visual signature of the scan flow.
// #10b981 is emerald-500 (the canonical "medium green"): neither the
// pale green-300 nor the deep forest green-700 territory. Bright enough
// to read against any camera feed, saturated enough to feel deliberate
// rather than functional. Strands are thinner than the previous grey
// pass (1.5 vs 2.5) so the rendered mesh reads as "delicate connective
// tissue" instead of "drawn-on lines"; dots are larger (4.0 vs 2.5) so
// each landmark anchor stands out as a vertex, not a tiny speck.
const STROKE = '#10b981';
const STROKE_WIDTH = 1.5;
const STROKE_OPACITY = 0.85;
const VERTEX_COLOR = '#10b981';
const VERTEX_RADIUS = 4.0;
const VERTEX_GLOW = 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.85))';
const LABEL_COLOR = '#34d399'; // emerald-400 — slightly brighter for legibility

type AbstractSegment = {
  key: string;
  a: number;
  b: number;
  start: number;
  label?: boolean;
};

function lineLength(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

type Props = {
  landmarks: Landmark[];
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
  visible: boolean;
};

export function SpiderwebOverlay({
  landmarks,
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
  visible,
}: Props) {
  const [now, setNow] = useState(0);
  const [startedAt] = useState(() => performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(performance.now() - startedAt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt]);

  // object-cover mapping: video fills container, cropping the longer axis
  const { displayedW, displayedH, offsetX, offsetY } = useMemo(() => {
    const sa = containerWidth / containerHeight;
    const va = videoWidth / videoHeight;
    if (va > sa) {
      // video wider than container → fit height, overflow horizontally
      const dH = containerHeight;
      const dW = containerHeight * va;
      return { displayedW: dW, displayedH: dH, offsetX: (containerWidth - dW) / 2, offsetY: 0 };
    }
    // video taller than container → fit width, overflow vertically
    const dW = containerWidth;
    const dH = containerWidth / va;
    return { displayedW: dW, displayedH: dH, offsetX: 0, offsetY: (containerHeight - dH) / 2 };
  }, [containerWidth, containerHeight, videoWidth, videoHeight]);

  // Stable abstract list: which landmark pairs + timings (does not depend on landmark coords)
  const abstractSegments: AbstractSegment[] = useMemo(() => {
    const segs: AbstractSegment[] = [];
    for (const group of GROUPS) {
      const startMs = group.start * 1000;
      const endMs = group.end * 1000;
      const span = endMs - startMs;
      const steps = group.indices.length + (group.closed ? 0 : -1);
      const perStep = steps > 0 ? Math.max(0, span - LINE_DURATION_MS) / steps : 0;

      for (let i = 0; i < group.indices.length - (group.closed ? 0 : 1); i++) {
        const a = group.indices[i];
        const b = group.indices[(i + 1) % group.indices.length];
        segs.push({
          key: `${group.name}-${a}-${b}`,
          a,
          b,
          start: startMs + i * perStep,
        });
      }
    }
    const crossSpan = CROSS_END_MS - CROSS_START_MS;
    const crossPer = (crossSpan - LINE_DURATION_MS) / Math.max(1, CROSS_PAIRS.length - 1);
    CROSS_PAIRS.forEach(([a, b], i) => {
      segs.push({
        key: `cross-${a}-${b}`,
        a,
        b,
        start: CROSS_START_MS + i * crossPer,
        label: true,
      });
    });
    return segs;
  }, []);

  const toPx = (l: Landmark | undefined) =>
    l ? { x: offsetX + l.x * displayedW, y: offsetY + l.y * displayedH } : null;

  // IPD scale for label values (recomputed each frame from current landmarks)
  const ipd = (() => {
    const a = toPx(landmarks[468]);
    const b = toPx(landmarks[473]);
    if (!a || !b) return Math.max(displayedW, displayedH) * 0.18;
    const len = lineLength(a.x, a.y, b.x, b.y);
    return len > 0 ? len : Math.max(displayedW, displayedH) * 0.18;
  })();

  return (
    <AnimatePresence>
      {visible && (
        <motion.svg
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_OUT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${containerWidth} ${containerHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ transform: 'scaleX(-1)' }}
        >
          <g>
            {abstractSegments.map((seg) => {
              const pa = toPx(landmarks[seg.a]);
              const pb = toPx(landmarks[seg.b]);
              if (!pa || !pb) return null;
              const len = lineLength(pa.x, pa.y, pb.x, pb.y);
              const elapsed = Math.max(0, now - seg.start);
              const progress = Math.min(1, elapsed / LINE_DURATION_MS);
              const offset = len * (1 - progress);
              return (
                <line
                  key={seg.key}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={STROKE}
                  strokeWidth={STROKE_WIDTH}
                  strokeOpacity={STROKE_OPACITY}
                  strokeDasharray={len}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              );
            })}
            {abstractSegments.map((seg) => {
              const pb = toPx(landmarks[seg.b]);
              if (!pb) return null;
              const op = now > seg.start + LINE_DURATION_MS / 2 ? 0.95 : 0;
              return (
                <circle
                  key={`v-${seg.key}`}
                  cx={pb.x}
                  cy={pb.y}
                  r={VERTEX_RADIUS}
                  fill={VERTEX_COLOR}
                  opacity={op}
                  style={{ filter: VERTEX_GLOW }}
                />
              );
            })}
            {abstractSegments
              .filter((s) => s.label)
              .map((seg) => {
                const pa = toPx(landmarks[seg.a]);
                const pb = toPx(landmarks[seg.b]);
                if (!pa || !pb) return null;
                const elapsed = Math.max(0, now - seg.start - LINE_DURATION_MS);
                const op = Math.min(0.7, elapsed / 300);
                if (op <= 0) return null;
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                const len = lineLength(pa.x, pa.y, pb.x, pb.y);
                const labelValue = Math.round((len / ipd) * 100);
                return (
                  <text
                    key={`${seg.key}-label`}
                    x={mx}
                    y={my - 6}
                    fill={LABEL_COLOR}
                    fillOpacity={op}
                    fontSize={12}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    textAnchor="middle"
                    style={{ transform: 'scaleX(-1)', transformOrigin: `${mx}px ${my}px` }}
                  >
                    {labelValue}pt
                  </text>
                );
              })}
          </g>
        </motion.svg>
      )}
    </AnimatePresence>
  );
}

export const SPIDERWEB_TOTAL_MS = TOTAL_MS;
export const SPIDERWEB_FADEOUT_MS = FADE_OUT_MS;
