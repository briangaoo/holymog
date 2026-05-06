import type {
  CaptureExtras,
  FinalScores,
  Landmark,
  SourceScore,
  SubScores,
  VisionScore,
} from '@/types';
import { computeGoldenRatio } from './goldenRatio';
import { computeProprietary } from './proprietary';

type SubKey = keyof SubScores;

const WEIGHTS: Record<SubKey, { golden: number; proprietary: number; vision: number }> = {
  jawline: { golden: 0.05, proprietary: 0.5, vision: 0.45 },
  eyes: { golden: 0.05, proprietary: 0.5, vision: 0.45 },
  skin: { golden: 0, proprietary: 0, vision: 1 },
  cheekbones: { golden: 0.05, proprietary: 0.35, vision: 0.6 },
};

function avg(xs: number[]): number {
  if (xs.length === 0) return 50;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Vision comes from 3 parallel Grok calls covering 31 fields.
 *  Each sub-score averages the relevant fields. */
function visionContribution(v: VisionScore, key: SubKey): number {
  switch (key) {
    case 'jawline':
      // lower face / mouth zone
      return avg([
        v.jawline_definition,
        v.chin_definition,
        v.smile_quality,
        v.lip_shape,
      ]);
    case 'eyes':
      return avg([
        v.eye_size,
        v.eye_shape,
        v.eye_bags,
        v.canthal_tilt,
        v.iris_appeal,
        v.brow_shape,
        v.brow_thickness,
      ]);
    case 'skin':
      return avg([v.skin_clarity, v.skin_evenness, v.skin_tone]);
    case 'cheekbones':
      // mid face — cheekbones, nose, ears, philtrum, forehead, temples, thirds
      return avg([
        v.cheekbone_prominence,
        v.nose_shape,
        v.nose_proportion,
        v.forehead_proportion,
        v.temple_hollow,
        v.ear_shape,
        v.philtrum,
        v.facial_thirds_visual,
      ]);
  }
}

/** 5th composite — fields that don't belong to a specific facial region but
 *  matter for overall attractiveness (hair, posture, confidence, holistic). */
export function computePresentation(v: VisionScore): number {
  return avg([
    v.hair_quality,
    v.hair_styling,
    v.posture,
    v.confidence,
    v.masculinity_femininity,
    v.symmetry,
    v.feature_harmony,
    v.overall_attractiveness,
    v.lip_proportion,
  ]);
}

function combineSub(
  key: SubKey,
  golden: SourceScore,
  proprietary: SourceScore,
  vision: VisionScore,
): number {
  const sources: Array<{ value: number; weight: number }> = [];
  const w = WEIGHTS[key];

  if (w.golden > 0 && golden.sub[key] !== null) {
    sources.push({ value: golden.sub[key] as number, weight: w.golden });
  }
  if (w.proprietary > 0 && proprietary.sub[key] !== null) {
    sources.push({ value: proprietary.sub[key] as number, weight: w.proprietary });
  }
  if (w.vision > 0) {
    sources.push({ value: visionContribution(vision, key), weight: w.vision });
  }

  const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
  if (totalWeight === 0) return 50;
  const weighted = sources.reduce((s, x) => s + x.value * x.weight, 0);
  return weighted / totalWeight;
}

export function scaleLandmarksToPixels(
  landmarks: Landmark[],
  width: number,
  height: number,
): Landmark[] {
  return landmarks.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z }));
}

export function computeClientScores(
  landmarks: Landmark[],
  width: number,
  height: number,
  extras: CaptureExtras,
): { golden: SourceScore; proprietary: SourceScore } {
  const scaled = scaleLandmarksToPixels(landmarks, width, height);
  return {
    golden: computeGoldenRatio(scaled),
    proprietary: computeProprietary(scaled, extras),
  };
}

export function combineScores(
  golden: SourceScore,
  proprietary: SourceScore,
  vision: VisionScore,
): FinalScores {
  const jawline = combineSub('jawline', golden, proprietary, vision);
  const eyes = combineSub('eyes', golden, proprietary, vision);
  const skin = combineSub('skin', golden, proprietary, vision);
  const cheekbones = combineSub('cheekbones', golden, proprietary, vision);
  const presentation = computePresentation(vision);

  // 25/20/20/15/20 — presentation now factors directly into the overall.
  const overallRaw =
    0.25 * jawline +
    0.2 * eyes +
    0.2 * skin +
    0.15 * cheekbones +
    0.2 * presentation;

  return {
    overall: Math.round(overallRaw),
    presentation: Math.round(presentation),
    sub: {
      jawline: Math.round(jawline),
      eyes: Math.round(eyes),
      skin: Math.round(skin),
      cheekbones: Math.round(cheekbones),
    },
    vision,
  };
}

export function mockVisionScore(): VisionScore {
  const r = () => Math.floor(Math.random() * 51) + 30;
  return {
    jawline_definition: r(),
    chin_definition: r(),
    cheekbone_prominence: r(),
    nose_shape: r(),
    nose_proportion: r(),
    forehead_proportion: r(),
    temple_hollow: r(),
    ear_shape: r(),
    facial_thirds_visual: r(),
    eye_size: r(),
    eye_shape: r(),
    eye_bags: r(),
    canthal_tilt: r(),
    iris_appeal: r(),
    brow_shape: r(),
    brow_thickness: r(),
    lip_shape: r(),
    lip_proportion: r(),
    smile_quality: r(),
    philtrum: r(),
    skin_clarity: r(),
    skin_evenness: r(),
    skin_tone: r(),
    hair_quality: r(),
    hair_styling: r(),
    posture: r(),
    confidence: r(),
    masculinity_femininity: r(),
    symmetry: r(),
    feature_harmony: r(),
    overall_attractiveness: r(),
  };
}
