import type {
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
  jawline: { golden: 0.3, proprietary: 0.35, vision: 0.35 },
  eyes: { golden: 0.3, proprietary: 0.35, vision: 0.35 },
  skin: { golden: 0, proprietary: 0, vision: 1 },
  cheekbones: { golden: 0.15, proprietary: 0.25, vision: 0.6 },
};

const VISION_KEY: Record<SubKey, keyof VisionScore> = {
  jawline: 'jawline_definition',
  eyes: 'eye_proportion',
  skin: 'skin_clarity',
  cheekbones: 'cheekbone_prominence',
};

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
    const v = vision[VISION_KEY[key]] as number;
    sources.push({ value: v, weight: w.vision });
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
): { golden: SourceScore; proprietary: SourceScore } {
  const scaled = scaleLandmarksToPixels(landmarks, width, height);
  return {
    golden: computeGoldenRatio(scaled),
    proprietary: computeProprietary(scaled),
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

  const overallRaw =
    0.3 * jawline + 0.25 * eyes + 0.25 * skin + 0.2 * cheekbones;

  return {
    overall: Math.round(overallRaw),
    sub: {
      jawline: Math.round(jawline),
      eyes: Math.round(eyes),
      skin: Math.round(skin),
      cheekbones: Math.round(cheekbones),
    },
  };
}

export function mockVisionScore(): VisionScore {
  const r = () => Math.floor(Math.random() * 51) + 30;
  return {
    jawline_definition: r(),
    eye_proportion: r(),
    skin_clarity: r(),
    cheekbone_prominence: r(),
    symmetry: r(),
    feature_harmony: r(),
  };
}
