'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '@/types';

/**
 * Face-conforming triangulated mesh, rendered with depth cues to read
 * as 3D. Uses MediaPipe's 478-landmark FaceLandmarker output AS the
 * mesh vertices — landmarks have real X / Y / Z values, so each
 * connection knows which end is closer to the camera.
 *
 * Visual:
 *   - White strands tracing MediaPipe's FACE_LANDMARKS_TESSELATION
 *     (~430 unique triangle edges spanning the entire front of the
 *     face: forehead, brow, eye sockets, nose, cheeks, lips, jaw)
 *   - Per-edge opacity + stroke-width modulated by the average Z of
 *     its two endpoints. Strands sitting in front of the face plane
 *     render brighter / thicker; strands on the periphery (further
 *     back, near the ears + jaw outline) render dimmer / thinner.
 *     That depth cue is what makes the mesh feel volumetric rather
 *     than a flat overlay.
 *   - Emerald-500 accent dots on prominent feature landmarks (eye
 *     corners, brow peaks, nose tip / bridge, lip corners + cupid's
 *     bow, chin, forehead, cheekbones).
 *
 * Earlier iterations of this file (1) used a sparse hand-picked
 * outline that didn't look dense enough, (2) used flat tesselation
 * that read as drawn-on, (3) used a procedural ellipsoid that wrapped
 * the head but didn't conform to facial features ("just a globe").
 * This version conforms (it IS the landmark mesh) AND feels 3D (Z-
 * channel drives the visual depth).
 */

// Key facial landmarks for the green accent dots. Standard MediaPipe
// 478-point numbering. These are the points where green pops on top
// of the white mesh.
const ACCENT_LANDMARKS = [
  33, 133, 362, 263, // eye corners (outer + inner)
  70, 105, 300, 334, // brow peaks
  1, 168, // nose tip + bridge top
  61, 291, 0, 17, // lip corners + cupid's bow + lower-lip centre
  152, 10, // chin + forehead centre
  234, 454, // outer cheekbones
];

// Per-segment styling. Stroke width + opacity are modulated by depth
// at draw time — these are the "front of the face" peaks; the back
// edges fade out from here.
const STROKE = '#ffffff';
const STROKE_WIDTH_FRONT = 1.4;
const STROKE_WIDTH_BACK = 0.6;
const STROKE_OPACITY_FRONT = 0.85;
const STROKE_OPACITY_BACK = 0.25;

const ACCENT_COLOR = '#10b981';
const ACCENT_RADIUS = 3.5;
const ACCENT_GLOW = 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.85))';

export const SPIDERWEB_TOTAL_MS = 5000;
export const SPIDERWEB_FADEOUT_MS = 400;

// MediaPipe's tesselation lists each triangle edge twice (once per
// adjoining triangle). Dedupe by min/max pair so each unique edge is
// drawn once. Cached at module load — Tesselation is a static constant
// on FaceLandmarker that doesn't change across page loads.
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
  // coords (normalized 0..1 video space) onto the screen overlay.
  const { displayedW, displayedH, offsetX, offsetY } = useMemo(() => {
    const sa = containerWidth / containerHeight;
    const va = videoWidth / videoHeight;
    if (va > sa) {
      const dH = containerHeight;
      const dW = containerHeight * va;
      return {
        displayedW: dW,
        displayedH: dH,
        offsetX: (containerWidth - dW) / 2,
        offsetY: 0,
      };
    }
    const dW = containerWidth;
    const dH = containerWidth / va;
    return {
      displayedW: dW,
      displayedH: dH,
      offsetX: 0,
      offsetY: (containerHeight - dH) / 2,
    };
  }, [containerWidth, containerHeight, videoWidth, videoHeight]);

  // Compute the Z range across all landmarks each frame so depth cueing
  // is normalized to this specific face. Different head poses + camera
  // distances give different absolute Z spreads; normalizing per-frame
  // keeps the visual contrast consistent.
  const zStats = useMemo(() => {
    if (!landmarks.length) return { zMin: 0, zMax: 1 };
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const l of landmarks) {
      if (l.z < zMin) zMin = l.z;
      if (l.z > zMax) zMax = l.z;
    }
    return { zMin, zMax: zMax > zMin ? zMax : zMin + 1 };
  }, [landmarks]);

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
            {/* Triangulated face-conforming mesh. ~430 unique edges
                spanning the front of the face (forehead → jaw). Each
                edge's stroke-width + opacity are modulated by the
                average Z of its two endpoints so the mesh reads as
                volumetric. */}
            {connections.map((conn) => {
              const la = landmarks[conn.a];
              const lb = landmarks[conn.b];
              if (!la || !lb) return null;

              const x1 = offsetX + la.x * displayedW;
              const y1 = offsetY + la.y * displayedH;
              const x2 = offsetX + lb.x * displayedW;
              const y2 = offsetY + lb.y * displayedH;

              // Depth t: 0 = furthest back (Z max), 1 = furthest front
              // (Z min). MediaPipe's convention has negative Z toward
              // the camera, so smaller-z landmarks sit in front.
              const zAvg = (la.z + lb.z) / 2;
              const t =
                1 - (zAvg - zStats.zMin) / (zStats.zMax - zStats.zMin);
              // Lerp between front + back style based on depth t.
              const strokeWidth =
                STROKE_WIDTH_BACK + (STROKE_WIDTH_FRONT - STROKE_WIDTH_BACK) * t;
              const strokeOpacity =
                STROKE_OPACITY_BACK +
                (STROKE_OPACITY_FRONT - STROKE_OPACITY_BACK) * t;

              return (
                <line
                  key={`m-${conn.a}-${conn.b}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={STROKE}
                  strokeWidth={strokeWidth}
                  strokeOpacity={strokeOpacity}
                />
              );
            })}
            {/* Emerald accent dots on prominent feature landmarks. */}
            {ACCENT_LANDMARKS.map((i) => {
              const p = landmarks[i];
              if (!p) return null;
              return (
                <circle
                  key={`a-${i}`}
                  cx={offsetX + p.x * displayedW}
                  cy={offsetY + p.y * displayedH}
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
