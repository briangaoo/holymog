import type { Landmark, SourceScore } from '@/types';

const PHI = 1.618;

const I = {
  hairline: 10,
  chin: 152,
  faceLeft: 234,
  faceRight: 454,
  noseTip: 1,
  noseLeft: 49,
  noseRight: 279,
  noseBase: 2,
  mouthLeft: 61,
  mouthRight: 291,
  upperLipTop: 13,
  lowerLipBottom: 14,
  philtrumTop: 164,
  leftPupil: 468,
  rightPupil: 473,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  cheekLeft: 116,
  cheekRight: 345,
} as const;

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function ratioScore(value: number, target: number): number {
  if (!isFinite(value) || value <= 0) return 50;
  const deviation = Math.abs(value - target) / target;
  return Math.max(20, 100 - Math.min(80, deviation * 55));
}

function targetScore(value: number, target: number): number {
  if (!isFinite(value) || value <= 0) return 50;
  const deviation = Math.abs(value - target) / target;
  return Math.max(20, 100 - Math.min(80, deviation * 80));
}

export function computeGoldenRatio(lm: Landmark[]): SourceScore {
  const faceLength = dist(lm[I.hairline], lm[I.chin]);
  const faceWidth = dist(lm[I.faceLeft], lm[I.faceRight]);
  const mouthWidth = dist(lm[I.mouthLeft], lm[I.mouthRight]);
  const noseWidth = dist(lm[I.noseLeft], lm[I.noseRight]);
  const ipd = dist(lm[I.leftPupil], lm[I.rightPupil]);
  const eyeWidth =
    (dist(lm[I.leftEyeOuter], lm[I.leftEyeInner]) +
      dist(lm[I.rightEyeOuter], lm[I.rightEyeInner])) /
    2;
  const noseToChin = dist(lm[I.noseBase], lm[I.chin]);
  const noseToHairline = dist(lm[I.noseBase], lm[I.hairline]);
  const philtrumLength = dist(lm[I.philtrumTop], lm[I.upperLipTop]);
  const lowerLipToChin = dist(lm[I.lowerLipBottom], lm[I.chin]);
  const cheekboneWidth = dist(lm[I.cheekLeft], lm[I.cheekRight]);

  const ratio1 = faceLength / faceWidth;
  const ratio2 = mouthWidth / noseWidth;
  const ratio3 = ipd / eyeWidth;
  const ratio4 = noseToChin / noseToHairline;
  const ratio5 = philtrumLength / lowerLipToChin;
  const cheekRatio = cheekboneWidth / faceWidth;

  const r1 = ratioScore(ratio1, PHI);
  const r2 = ratioScore(ratio2, PHI);
  const r3 = ratioScore(ratio3, PHI);
  const r4 = ratioScore(ratio4, PHI);
  const r5 = ratioScore(ratio5, PHI);
  const cheekScore = targetScore(cheekRatio, 0.85);

  const overall = (r1 + r2 + r3 + r4 + r5) / 5;

  return {
    overall,
    sub: {
      jawline: (r1 + r4) / 2,
      eyes: r3,
      cheekbones: cheekScore,
      skin: null,
    },
    details: {
      'faceLen/faceW vs phi': { value: ratio1, score: r1, target: PHI },
      'mouthW/noseW vs phi': { value: ratio2, score: r2, target: PHI },
      'ipd/eyeW vs phi': { value: ratio3, score: r3, target: PHI },
      'noseToChin/noseToHair vs phi': { value: ratio4, score: r4, target: PHI },
      'philtrum/lowerLipChin vs phi': { value: ratio5, score: r5, target: PHI },
      'cheekW/faceW vs 0.85': { value: cheekRatio, score: cheekScore, target: 0.85 },
    },
  };
}
