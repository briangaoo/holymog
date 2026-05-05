import type { Landmark, SourceScore } from '@/types';

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
  jawLeft: 172,
  jawRight: 397,
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

function targetClose(value: number, lo: number, hi: number): number {
  if (value >= lo && value <= hi) return 100;
  const center = (lo + hi) / 2;
  const half = Math.max(1, (hi - lo) / 2);
  const dist = Math.abs(value - center) - half;
  return clampScore(100 - (dist / half) * 40);
}

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
    const ta = (pa.x - nose.x) * ax + (pa.y - nose.y) * ay;
    void ta;
    const tb = (pb.x - nose.x) * ax + (pb.y - nose.y) * ay;
    const mirroredX = nose.x + ax * tb + nx * -sb;
    const mirroredY = nose.y + ay * tb + ny * -sb;
    const d = Math.sqrt((pa.x - mirroredX) ** 2 + (pa.y - mirroredY) ** 2);
    total += d;
    count += 1;
  }
  const faceWidth = dist(lm[I.faceLeft], lm[I.faceRight]) || 1;
  const normalized = total / count / faceWidth;
  return { score: clampScore(100 - normalized * 220), normalized };
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
  return { score: targetClose(avg, 2, 10), angle: avg };
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
  return { score: targetClose(avg, 110, 140), angle: avg };
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
  return { score: clampScore(100 - variance * 800), t1: a, t2: b, t3: c };
}

type FifthsResult = { score: number; ratio: number };
function facialFifthsScore(lm: Landmark[]): FifthsResult {
  const faceWidth = dist(lm[I.faceLeft], lm[I.faceRight]) || 1;
  const eyeWidthL = dist(lm[I.leftEyeOuter], lm[I.leftEyeInner]);
  const eyeWidthR = dist(lm[I.rightEyeOuter], lm[I.rightEyeInner]);
  const eyeWidth = (eyeWidthL + eyeWidthR) / 2 || 1;
  const ratio = faceWidth / eyeWidth;
  return { score: targetClose(ratio, 4.4, 5.6), ratio };
}

export function computeProprietary(lm: Landmark[]): SourceScore {
  const sym = symmetryScore(lm);
  const tilt = canthalTilt(lm);
  const gonial = gonialAngle(lm);
  const thirds = facialThirdsScore(lm);
  const fifths = facialFifthsScore(lm);

  const overall = (sym.score + tilt.score + gonial.score + thirds.score + fifths.score) / 5;

  return {
    overall,
    sub: {
      jawline: (sym.score + gonial.score) / 2,
      eyes: (sym.score + tilt.score) / 2,
      cheekbones: (sym.score + fifths.score) / 2,
      skin: null,
    },
    details: {
      'symmetry (asymmetry/faceW)': {
        value: sym.normalized,
        score: sym.score,
        target: '~0',
      },
      'canthal tilt (deg)': { value: tilt.angle, score: tilt.score, target: '2–10°' },
      'gonial angle (deg)': { value: gonial.angle, score: gonial.score, target: '110–140°' },
      'thirds upper (frac)': { value: thirds.t1, score: thirds.score, target: 0.333 },
      'thirds middle (frac)': { value: thirds.t2, score: thirds.score, target: 0.333 },
      'thirds lower (frac)': { value: thirds.t3, score: thirds.score, target: 0.333 },
      'fifths (faceW/eyeW)': { value: fifths.ratio, score: fifths.score, target: '4.4–5.6' },
    },
  };
}
