'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Landmark } from '@/types';

/**
 * Procedural 3D wireframe head model rendered over the camera feed.
 *
 * Generates an ellipsoid in head-local space (sized from face landmarks),
 * orients it using a rotation matrix derived from the user's actual
 * facial features (eye line + nose-to-chin direction), and projects it
 * to 2D for SVG rendering. The result is a lat/long quad-grid wireframe
 * that wraps the user's head and rotates as they turn — matches the
 * 3D-head-scanner reference Brian shared instead of the flat face
 * triangulation we had before.
 *
 * Why this approach instead of MediaPipe's built-in FACE_LANDMARKS_
 * TESSELATION: that constant only connects the 478 face landmarks
 * into a triangle mesh on the front of the face — it has no volumetric
 * depth, no lat/long grid pattern, and visually reads as "drawn on"
 * rather than "wraps around the head." The ellipsoid is procedural, so
 * we get the regular grid pattern from the reference image plus real
 * head-pose tracking from feature landmarks.
 */

// Lat/long resolution. Higher = denser mesh = closer to the reference
// but heavier to render. 18x28 lands around ~500 unique line segments
// in SVG and renders fine on desktop; mobile may want lower.
const LAT_SEGMENTS = 18;
const LON_SEGMENTS = 28;

// Head proportions relative to detected face size. Real heads are
// roughly ~140% as tall as the visible face (forehead → chin), ~150%
// as wide as the outer-cheek-to-outer-cheek distance (ears stick out),
// and ~95% as deep as wide. These multipliers keep the ellipsoid
// reading as "wraps the user's actual head" instead of "floats over
// their face."
const HEIGHT_MULT = 1.4;
const WIDTH_MULT = 1.5;
const DEPTH_MULT = 0.95;

const STROKE = '#ffffff';
const STROKE_WIDTH = 0.9;
const STROKE_OPACITY = 0.65;

const ACCENT_COLOR = '#10b981';
const ACCENT_RADIUS = 3.5;
const ACCENT_GLOW = 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.85))';

// Key facial landmarks for the green accent dots. Standard MediaPipe
// 478-point numbering.
const ACCENT_LANDMARKS = [
  33, 133, 362, 263, // eye corners (outer + inner)
  70, 105, 300, 334, // brow peaks
  1, 168, // nose tip + bridge top
  61, 291, 0, 17, // lip corners + cupid's bow + lower-lip centre
  152, 10, // chin + forehead centre
  234, 454, // outer cheekbones
];

export const SPIDERWEB_TOTAL_MS = 5000;
export const SPIDERWEB_FADEOUT_MS = 400;

// ---- Vector helpers --------------------------------------------------------

type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const normalize = (v: Vec3): Vec3 => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

// ---- Component ------------------------------------------------------------

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
  // object-cover mapping: the camera <video> fills the container,
  // cropping whichever axis is longer. Reproduce that mapping when
  // projecting landmark coords onto the overlay.
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

  // Map a normalized landmark to its 3D position in screen-aligned px
  // space. Landmark x/y are already in [0,1] of the video; z is a
  // relative depth offset (in roughly the same units as the longer
  // edge of the video).
  const lmToPx = (l: Landmark | undefined): Vec3 | null => {
    if (!l) return null;
    return {
      x: offsetX + l.x * displayedW,
      y: offsetY + l.y * displayedH,
      z: l.z * displayedW,
    };
  };

  // Generate the ellipsoid vertices + project to 2D every render. This
  // is O(LAT * LON) per frame — ~500 vertices for the default 18×28.
  // Cheap enough for 30 Hz.
  const projected = useMemo(() => {
    const forehead = lmToPx(landmarks[10]);
    const chin = lmToPx(landmarks[152]);
    const leftCheek = lmToPx(landmarks[234]);
    const rightCheek = lmToPx(landmarks[454]);
    const nose = lmToPx(landmarks[1]);
    if (!forehead || !chin || !leftCheek || !rightCheek || !nose) return null;

    // Head reference centre — geometric average of the forehead /
    // chin / cheek anchors. Slightly biased toward the back of the
    // head so the ellipsoid wraps both the visible face AND the
    // implied back-of-skull volume.
    const faceCenter: Vec3 = {
      x: (forehead.x + chin.x + leftCheek.x + rightCheek.x) / 4,
      y: (forehead.y + chin.y + leftCheek.y + rightCheek.y) / 4,
      z: (forehead.z + chin.z + leftCheek.z + rightCheek.z) / 4,
    };

    // Head local axes derived from the actual face geometry. As the
    // user rotates their head, these axes rotate with them — which is
    // exactly what makes the ellipsoid feel 3D.
    const right = normalize(sub(rightCheek, leftCheek));
    const down = normalize(sub(chin, forehead));
    // Forward = right × down points toward the camera (or away,
    // depending on coordinate convention). MediaPipe's convention has
    // +Y down + +X right in screen space, so the cross product points
    // in -Z (toward viewer in MediaPipe space, which means smaller z
    // = closer to camera).
    const forward = normalize(cross(right, down));

    // Head dimensions based on cheek-to-cheek + forehead-to-chin.
    const cheekDist = len(sub(rightCheek, leftCheek));
    const foreheadChinDist = len(sub(chin, forehead));
    const halfW = (cheekDist * WIDTH_MULT) / 2;
    const halfH = (foreheadChinDist * HEIGHT_MULT) / 2;
    const halfD = (cheekDist * DEPTH_MULT) / 2;

    // Bias the ellipsoid centre slightly back from the face so the
    // front of the wireframe sits at the surface of the user's face
    // rather than poking through it.
    const center: Vec3 = {
      x: faceCenter.x - forward.x * halfD * 0.4,
      y: faceCenter.y - forward.y * halfD * 0.4,
      z: faceCenter.z - forward.z * halfD * 0.4,
    };

    // Generate ellipsoid vertex grid + project to 2D screen using
    // simple orthographic projection (drop Z). The landmark Z values
    // are noisy in MediaPipe so a real perspective projection adds
    // jitter without much benefit — ortho looks plenty 3D because the
    // rotation comes from the head-local axes.
    type ProjectedVert = { x: number; y: number; visible: boolean };
    const verts: ProjectedVert[] = [];
    for (let i = 0; i <= LAT_SEGMENTS; i++) {
      const lat = (i / LAT_SEGMENTS) * Math.PI;
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      const y = cosLat * halfH;
      for (let j = 0; j <= LON_SEGMENTS; j++) {
        const lon = (j / LON_SEGMENTS) * 2 * Math.PI;
        const x = sinLat * Math.cos(lon) * halfW;
        const z = sinLat * Math.sin(lon) * halfD;
        // Transform from head-local space into screen space using
        // the head-local axes (right / down / forward).
        const sx = center.x + x * right.x + y * down.x + z * forward.x;
        const sy = center.y + x * right.y + y * down.y + z * forward.y;
        const sz = center.z + x * right.z + y * down.z + z * forward.z;
        // Vertex is "visible" (front of head) if its Z is in front of
        // the head centre, where smaller Z = closer to camera. Used
        // to dim back-of-head lines so they read as "behind" without
        // requiring true depth sorting.
        verts.push({ x: sx, y: sy, visible: sz <= center.z });
      }
    }
    return verts;
  }, [landmarks, offsetX, offsetY, displayedW, displayedH]);

  const accents = useMemo(() => {
    return ACCENT_LANDMARKS.map((idx) => {
      const p = lmToPx(landmarks[idx]);
      return p ? { i: idx, x: p.x, y: p.y } : null;
    }).filter((v): v is { i: number; x: number; y: number } => v !== null);
  }, [landmarks, offsetX, offsetY, displayedW, displayedH]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {visible && (
        <motion.svg
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: SPIDERWEB_FADEOUT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${containerWidth} ${containerHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          // Mirror to match the mirrored camera preview (scaleX(-1) on
          // the <video> element).
          style={{ transform: 'scaleX(-1)' }}
        >
          <g strokeLinecap="round">
            {projected &&
              renderEllipsoidLines(projected).map((seg, idx) => (
                <line
                  key={`m-${idx}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={STROKE}
                  strokeWidth={STROKE_WIDTH}
                  strokeOpacity={seg.front ? STROKE_OPACITY : STROKE_OPACITY * 0.35}
                />
              ))}
            {accents.map((a) => (
              <circle
                key={`a-${a.i}`}
                cx={a.x}
                cy={a.y}
                r={ACCENT_RADIUS}
                fill={ACCENT_COLOR}
                opacity={0.95}
                style={{ filter: ACCENT_GLOW }}
              />
            ))}
          </g>
        </motion.svg>
      )}
    </AnimatePresence>
  );
}

// Walk the LAT × LON grid and emit the lat/long line segments. Each
// segment carries a `front` flag so we can dim back-of-head lines.
function renderEllipsoidLines(
  verts: Array<{ x: number; y: number; visible: boolean }>,
): Array<{ x1: number; y1: number; x2: number; y2: number; front: boolean }> {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number; front: boolean }> = [];
  const cols = LON_SEGMENTS + 1;
  for (let i = 0; i < LAT_SEGMENTS; i++) {
    for (let j = 0; j < LON_SEGMENTS; j++) {
      const a = verts[i * cols + j];
      const b = verts[i * cols + (j + 1)];
      const c = verts[(i + 1) * cols + j];
      // Latitude line (horizontal): a → b
      segs.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        front: a.visible && b.visible,
      });
      // Longitude line (vertical): a → c
      segs.push({
        x1: a.x,
        y1: a.y,
        x2: c.x,
        y2: c.y,
        front: a.visible && c.visible,
      });
    }
  }
  return segs;
}
