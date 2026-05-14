'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '@/types';

/**
 * Dense facial mesh overlay rendered during the scan phase. Uses
 * MediaPipe's built-in FACE_LANDMARKS_TESSELATION (~860 triangle edges,
 * deduplicated to ~430 unique line segments) connecting all 478
 * landmarks into a full triangulated mesh that conforms to the user's
 * actual face — forehead, cheeks, nose, eyes, lips, jaw.
 *
 * Visual treatment:
 *   - Strands: pure white, 1px, 55% opacity. Thin, neutral connective
 *     tissue.
 *   - Accent dots: emerald-500 (#10b981) on the most prominent feature
 *     landmarks (eye corners, brow peaks, nose tip, lip corners,
 *     chin, forehead). Larger radius + glow filter so green is the
 *     standout colour.
 *
 * Performance posture: the dedupe runs once at module load. The
 * component itself has no requestAnimationFrame loop — it re-renders
 * only when `landmarks` changes (~30 Hz from useFaceDetection), and
 * the framer-motion fade in/out is the only state-driven animation.
 * SVG rendering of ~430 line elements + ~18 circles per frame; if
 * profiling shows this is janky on mobile, convert to a <canvas> with
 * an imperative draw loop.
 */

// Key feature landmarks where the green accent dots fire. Indices are
// the standard MediaPipe FaceLandmarker numbering (478-point model).
const ACCENT_LANDMARKS = [
  // Eyes — outer + inner corners
  33, 133, 362, 263,
  // Brows — peaks
  70, 105, 300, 334,
  // Nose tip + bridge top
  1, 168,
  // Lips — corners + cupid's bow + lower lip centre
  61, 291, 0, 17,
  // Chin + forehead centre
  152, 10,
  // Cheekbones — outer points
  234, 454,
];

const STROKE = '#ffffff';
const STROKE_WIDTH = 1;
const STROKE_OPACITY = 0.55;
const ACCENT_COLOR = '#10b981';
const ACCENT_RADIUS = 3.5;
const ACCENT_GLOW = 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.85))';

// Animation timings exported for the scan page (it gates the spiderweb
// render on its own scan-phase timeline; these constants document the
// expected duration so the parent can stay in sync).
export const SPIDERWEB_TOTAL_MS = 5000;
export const SPIDERWEB_FADEOUT_MS = 400;

// MediaPipe's tesselation lists every triangle edge twice (once per
// adjoining triangle). Dedupe by min/max pair so each unique edge is
// drawn once. Cached at module level so the dedupe runs once for the
// lifetime of the page rather than per render.
let CACHED_CONNECTIONS: Array<{ a: number; b: number }> | null = null;
function getConnections(): Array<{ a: number; b: number }> {
  if (CACHED_CONNECTIONS) return CACHED_CONNECTIONS;
  const tess = FaceLandmarker.FACE_LANDMARKS_TESSELATION ?? [];
  const seen = new Set<string>();
  const out: Array<{ a: number; b: number }> = [];
  for (const c of tess) {
    const a = Math.min(c.start, c.end);
    const b = Math.max(c.start, c.end);
    const key = `${a}-${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a, b });
  }
  CACHED_CONNECTIONS = out;
  return out;
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
  const connections = getConnections();

  // object-cover mapping: the camera <video> uses object-cover so the
  // displayed video fills the container, cropping whichever axis is
  // longer. We need to reproduce that mapping when projecting landmark
  // coords (which are in normalized 0..1 video space) onto the screen
  // overlay (which is in container px space).
  const { displayedW, displayedH, offsetX, offsetY } = useMemo(() => {
    const sa = containerWidth / containerHeight;
    const va = videoWidth / videoHeight;
    if (va > sa) {
      // video wider than container → fit height, overflow horizontally
      const dH = containerHeight;
      const dW = containerHeight * va;
      return {
        displayedW: dW,
        displayedH: dH,
        offsetX: (containerWidth - dW) / 2,
        offsetY: 0,
      };
    }
    // video taller than container → fit width, overflow vertically
    const dW = containerWidth;
    const dH = containerWidth / va;
    return {
      displayedW: dW,
      displayedH: dH,
      offsetX: 0,
      offsetY: (containerHeight - dH) / 2,
    };
  }, [containerWidth, containerHeight, videoWidth, videoHeight]);

  const toPx = (l: Landmark | undefined) =>
    l ? { x: offsetX + l.x * displayedW, y: offsetY + l.y * displayedH } : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.svg
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: SPIDERWEB_FADEOUT_MS / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${containerWidth} ${containerHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          // Mirror to match the mirrored camera preview (scaleX(-1) on
          // the <video> element). Without this the mesh would track the
          // wrong half of the user's face.
          style={{ transform: 'scaleX(-1)' }}
        >
          <g strokeLinecap="round">
            {/* Triangle-mesh strands. ~430 unique edges connecting the
                full 478-landmark face mesh. */}
            {connections.map((conn) => {
              const pa = toPx(landmarks[conn.a]);
              const pb = toPx(landmarks[conn.b]);
              if (!pa || !pb) return null;
              return (
                <line
                  key={`m-${conn.a}-${conn.b}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={STROKE}
                  strokeWidth={STROKE_WIDTH}
                  strokeOpacity={STROKE_OPACITY}
                />
              );
            })}
            {/* Emerald accent dots on the prominent feature landmarks.
                These are the "standout colour moment" — bright green
                anchors that pop against the white skeleton. */}
            {ACCENT_LANDMARKS.map((i) => {
              const p = toPx(landmarks[i]);
              if (!p) return null;
              return (
                <circle
                  key={`a-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={ACCENT_RADIUS}
                  fill={ACCENT_COLOR}
                  opacity={0.95}
                  style={{ filter: ACCENT_GLOW }}
                />
              );
            })}
          </g>
        </motion.svg>
      )}
    </AnimatePresence>
  );
}
