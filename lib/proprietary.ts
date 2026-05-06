import type { Blendshapes, CaptureExtras, HeadPose, Landmark, SourceScore } from '@/types';

/* ============================================================================
 *  Proprietary face-analysis algorithm.
 *
 *  Eleven metrics across two families:
 *   GEOMETRY (from landmarks):
 *     - symmetry           bilateral mirror match
 *     - canthal_tilt       eye corner angle from horizontal
 *     - gonial_angle       jaw corner angle
 *     - thirds             vertical face proportion equality
 *     - fifths             horizontal face proportion equality
 *
 *   POSE / EXPRESSION (from MediaPipe blendshapes + transform):
 *     - eye_openness       both eyes clearly open, no squint
 *     - head_pose          how frontally the face is oriented
 *     - jaw_neutrality     jaw not jutted, recessed, or shifted
 *     - mouth_neutrality   mouth not contorted (funnel/pucker/stretch)
 *     - cheek_neutrality   cheeks not puffed
 *
 *  All metrics are in [0, 100]. Curves are piecewise linear and tuned so:
 *    • inputs in the "normal human" range score 90–100
 *    • inputs in the gaming/distortion range drop fast (20+ point swings)
 *    • extreme distortion floors to 0
 * ========================================================================= */

const SYMMETRY_PAIRS: Array<[number, number]> = [
  [33, 263],
  [133, 362],
  [61, 291],
  [78, 308],
  [234, 454],
  [127, 356],
  [172, 397],
  [136, 365],
  [150, 379],
  [149, 378],
  [176, 400],
  [148, 377],
  [93, 323],
  [132, 361],
  [58, 288],
  [21, 251],
  [54, 284],
  [103, 332],
  [67, 297],
  [109, 338],
  [70, 300],
  [63, 293],
  [105, 334],
  [66, 296],
  [107, 336],
];

const I = {
  noseTip: 1,
  chin: 152,
  hairline: 10,
  noseBase: 2,
  brow: 9,
  faceLeft: 234,
  faceRight: 454,
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  jawCornerLeft: 58,
  jawCornerRight: 288,
} as const;

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampScore(s: number): number {
  return Math.max(0, Math.min(100, s));
}

/**
 * Piecewise-linear scoring around a sweet zone.
 *   value in [lo, hi]                     → 100
 *   gradually drops to `softFloor` at ±soft outside the zone
 *   linearly drops to 0 at ±hard outside the zone
 *   beyond hard distance: 0
 */
function piecewise(
  value: number,
  lo: number,
  hi: number,
  softDistance: number,
  hardDistance: number,
  softFloor = 60,
): number {
  if (value >= lo && value <= hi) return 100;
  const dist = value < lo ? lo - value : value - hi;
  if (dist >= hardDistance) return 0;
  if (dist <= softDistance) {
    const t = dist / softDistance;
    return clampScore(100 - (100 - softFloor) * t);
  }
  const t = (dist - softDistance) / (hardDistance - softDistance);
  return clampScore(softFloor - softFloor * t);
}

/* ----------------------------- GEOMETRY ----------------------------------- */

type SymmetryResult = { score: number; normalized: number };
function symmetryScore(lm: Landmark[]): SymmetryResult {
  const nose = lm[I.noseTip];
  const chin = lm[I.chin];
  const dx = chin.x - nose.x;
  const dy = chin.y - nose.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { score: 50, normalized: 0 };
  const ax = dx / len;
  const ay = dy / len;
  const nx = -ay;
  const ny = ax;

  let total = 0;
  let count = 0;
  for (const [a, b] of SYMMETRY_PAIRS) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb) continue;
    const sb = (pb.x - nose.x) * nx + (pb.y - nose.y) * ny;
    const tb = (pb.x - nose.x) * ax + (pb.y - nose.y) * ay;
    const mirroredX = nose.x + ax * tb + nx * -sb;
    const mirroredY = nose.y + ay * tb + ny * -sb;
    const d = Math.sqrt((pa.x - mirroredX) ** 2 + (pa.y - mirroredY) ** 2);
    total += d;
    count += 1;
  }
  const faceWidth = dist(lm[I.faceLeft], lm[I.faceRight]) || 1;
  const normalized = total / count / faceWidth;

  // Steeper than before:
  //  0.00–0.04 → 100    (very symmetric face)
  //  0.04–0.08 → 100→70 (mild asymmetry)
  //  0.08–0.18 → 70→0   (heavy asymmetry / distortion)
  let score: number;
  if (normalized <= 0.04) score = 100;
  else if (normalized <= 0.08) score = 100 - ((normalized - 0.04) / 0.04) * 30;
  else if (normalized <= 0.18) score = 70 - ((normalized - 0.08) / 0.1) * 70;
  else score = 0;

  return { score: clampScore(score), normalized };
}

type CanthalResult = { score: number; angle: number };
function canthalTilt(lm: Landmark[]): CanthalResult {
  const lOuter = lm[I.leftEyeOuter];
  const lInner = lm[I.leftEyeInner];
  const ldx = lOuter.x - lInner.x;
  const ldy = lOuter.y - lInner.y;
  const lAngle = (Math.atan2(-ldy, Math.abs(ldx)) * 180) / Math.PI;

  const rOuter = lm[I.rightEyeOuter];
  const rInner = lm[I.rightEyeInner];
  const rdx = rOuter.x - rInner.x;
  const rdy = rOuter.y - rInner.y;
  const rAngle = (Math.atan2(-rdy, Math.abs(rdx)) * 180) / Math.PI;

  const avg = (lAngle + rAngle) / 2;
  // sweet zone 2–10°, then drop. Negative = downturned eyes (anti-attractive).
  return { score: piecewise(avg, 2, 10, 4, 12, 50), angle: avg };
}

function angleAt(p: Landmark, a: Landmark, b: Landmark): number {
  const v1x = a.x - p.x;
  const v1y = a.y - p.y;
  const v2x = b.x - p.x;
  const v2y = b.y - p.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const m2 = Math.sqrt(v2x * v2x + v2y * v2y);
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2 || 1)));
  return (Math.acos(cos) * 180) / Math.PI;
}

type GonialResult = { score: number; angle: number };
function gonialAngle(lm: Landmark[]): GonialResult {
  const left = angleAt(lm[I.jawCornerLeft], lm[I.faceLeft], lm[I.chin]);
  const right = angleAt(lm[I.jawCornerRight], lm[I.faceRight], lm[I.chin]);
  const avg = (left + right) / 2;
  // sharp jaw target 110–135°, then drop hard
  return { score: piecewise(avg, 110, 135, 12, 30, 50), angle: avg };
}

type ThirdsResult = { score: number; t1: number; t2: number; t3: number };
function facialThirdsScore(lm: Landmark[]): ThirdsResult {
  const t1 = Math.abs(lm[I.brow].y - lm[I.hairline].y);
  const t2 = Math.abs(lm[I.noseBase].y - lm[I.brow].y);
  const t3 = Math.abs(lm[I.chin].y - lm[I.noseBase].y);
  const sum = t1 + t2 + t3 || 1;
  const a = t1 / sum;
  const b = t2 / sum;
  const c = t3 / sum;
  const ideal = 1 / 3;
  const variance = (a - ideal) ** 2 + (b - ideal) ** 2 + (c - ideal) ** 2;

  // variance ≤ 0.003 → 100, ≤ 0.012 → 100→60, ≤ 0.04 → 60→0
  let score: number;
  if (variance <= 0.003) score = 100;
  else if (variance <= 0.012) score = 100 - ((variance - 0.003) / 0.009) * 40;
  else if (variance <= 0.04) score = 60 - ((variance - 0.012) / 0.028) * 60;
  else score = 0;

  return { score: clampScore(score), t1: a, t2: b, t3: c };
}

type FifthsResult = { score: number; ratio: number };
function facialFifthsScore(lm: Landmark[]): FifthsResult {
  const faceWidth = dist(lm[I.faceLeft], lm[I.faceRight]) || 1;
  const eyeWidthL = dist(lm[I.leftEyeOuter], lm[I.leftEyeInner]);
  const eyeWidthR = dist(lm[I.rightEyeOuter], lm[I.rightEyeInner]);
  const eyeWidth = (eyeWidthL + eyeWidthR) / 2 || 1;
  const ratio = faceWidth / eyeWidth;
  // sweet 4.4–5.6, hard cutoff at ±1.5
  return { score: piecewise(ratio, 4.4, 5.6, 0.5, 1.5, 50), ratio };
}

/* ----------------------------- POSE / EXPRESSION -------------------------- */

type SimpleResult = { score: number; raw: number };

function eyeOpenness(b: Blendshapes): SimpleResult {
  // Lid closure only (eyeBlink). eyeSquint reflects natural eye shape, ignored.
  // Tightened: even mild closure starts costing, fully closed → 0 fast.
  const blink = Math.max(b.eyeBlinkLeft, b.eyeBlinkRight);

  let score: number;
  if (blink <= 0.2) score = 100;
  else if (blink <= 0.4) score = 100 - ((blink - 0.2) / 0.2) * 40;
  else if (blink <= 0.7) score = 60 - ((blink - 0.4) / 0.3) * 60;
  else score = 0;

  return { score: clampScore(score), raw: blink };
}

function headPoseScore(p: HeadPose): SimpleResult {
  // worst single-axis deviation
  const worst = Math.max(Math.abs(p.yaw), Math.abs(p.pitch), Math.abs(p.roll));

  let score: number;
  if (worst <= 6) score = 100;
  else if (worst <= 15) score = 100 - ((worst - 6) / 9) * 30;
  else if (worst <= 30) score = 70 - ((worst - 15) / 15) * 70;
  else score = 0;

  return { score: clampScore(score), raw: worst };
}

function jawNeutrality(b: Blendshapes): SimpleResult {
  // jawOpen ≥ 0.4 = mouth visibly hanging open. jawForward / jawLeft / jawRight
  // ≥ 0.3 = deliberate jaw push. Resting faces idle below those.
  const total =
    b.jawOpen + b.jawForward + Math.max(b.jawLeft, b.jawRight);

  let score: number;
  if (total <= 0.2) score = 100;
  else if (total <= 0.5) score = 100 - ((total - 0.2) / 0.3) * 40;
  else if (total <= 0.9) score = 60 - ((total - 0.5) / 0.4) * 60;
  else score = 0;

  return { score: clampScore(score), raw: total };
}

function mouthNeutrality(b: Blendshapes): SimpleResult {
  // Real distortion only: tongue-out / pucker / sideways shift.
  // `mouthRollLower/Upper` fire when lips are pressed together — that's a
  // closed mouth, the OPPOSITE of distortion. `mouthStretchLeft/Right` fire
  // for normal smiles. Don't include them.
  const total =
    b.mouthFunnel +
    b.mouthPucker +
    Math.max(b.mouthLeft, b.mouthRight);

  let score: number;
  if (total <= 0.25) score = 100;
  else if (total <= 0.55) score = 100 - ((total - 0.25) / 0.3) * 40;
  else if (total <= 1.0) score = 60 - ((total - 0.55) / 0.45) * 60;
  else score = 0;

  return { score: clampScore(score), raw: total };
}

function cheekNeutrality(b: Blendshapes): SimpleResult {
  const v = b.cheekPuff;
  let score: number;
  if (v <= 0.1) score = 100;
  else if (v <= 0.4) score = 100 - ((v - 0.1) / 0.3) * 60;
  else score = 40 - ((v - 0.4) / 0.6) * 40;
  return { score: clampScore(score), raw: v };
}

/* ------------------------------ ROLL-UP ----------------------------------- */

export function computeProprietary(
  lm: Landmark[],
  extras: CaptureExtras,
): SourceScore {
  const sym = symmetryScore(lm);
  const tilt = canthalTilt(lm);
  const gonial = gonialAngle(lm);
  const thirds = facialThirdsScore(lm);
  const fifths = facialFifthsScore(lm);

  const eyes = eyeOpenness(extras.blendshapes);
  const pose = headPoseScore(extras.headPose);
  const jaw = jawNeutrality(extras.blendshapes);
  const mouth = mouthNeutrality(extras.blendshapes);
  const cheek = cheekNeutrality(extras.blendshapes);

  // Pose/expression metrics gate ALL sub-scores: any extreme distortion drags
  // the proprietary overall down hard. We average the "everywhere" metrics
  // (sym, pose, mouth, jaw) into a baseline, then mix per-sub geometry on top.
  const everywhere = (sym.score + pose.score + mouth.score) / 3;

  const jawlineSub =
    (sym.score + gonial.score + jaw.score + pose.score + mouth.score) / 5;
  // Eye sub-score is GATED by openness: if the eyes can't be seen, the
  // sub-score is forced low regardless of symmetry/tilt/pose.
  // Gate: 0.15 floor + 0.85 * (openness/100). Eyes fully closed → ×0.15.
  const eyesBase = (sym.score + tilt.score + pose.score) / 3;
  const eyesGate = 0.15 + 0.85 * (eyes.score / 100);
  const eyesSub = eyesBase * eyesGate;
  const cheekbonesSub =
    (sym.score + fifths.score + cheek.score + pose.score) / 4;

  const overall =
    (sym.score +
      tilt.score +
      gonial.score +
      thirds.score +
      fifths.score +
      eyes.score +
      pose.score +
      jaw.score +
      mouth.score +
      cheek.score) /
    10;

  void everywhere;

  return {
    overall,
    sub: {
      jawline: jawlineSub,
      eyes: eyesSub,
      cheekbones: cheekbonesSub,
      skin: null,
    },
    details: {
      'symmetry (asymmetry/faceW)': {
        value: sym.normalized,
        score: sym.score,
        target: '~0',
      },
      'canthal tilt (deg)': { value: tilt.angle, score: tilt.score, target: '2–10°' },
      'gonial angle (deg)': { value: gonial.angle, score: gonial.score, target: '110–135°' },
      'thirds upper (frac)': { value: thirds.t1, score: thirds.score, target: 0.333 },
      'thirds middle (frac)': { value: thirds.t2, score: thirds.score, target: 0.333 },
      'thirds lower (frac)': { value: thirds.t3, score: thirds.score, target: 0.333 },
      'fifths (faceW/eyeW)': { value: fifths.ratio, score: fifths.score, target: '4.4–5.6' },
      'eye openness (closure 0–1)': {
        value: eyes.raw,
        score: eyes.score,
        target: '< 0.15',
      },
      'head pose worst-axis (deg)': {
        value: pose.raw,
        score: pose.score,
        target: '< 6°',
      },
      'jaw neutrality (sum)': { value: jaw.raw, score: jaw.score, target: '< 0.1' },
      'mouth neutrality (sum)': { value: mouth.raw, score: mouth.score, target: '< 0.15' },
      'cheek neutrality (puff)': {
        value: cheek.raw,
        score: cheek.score,
        target: '< 0.1',
      },
    },
  };
}
