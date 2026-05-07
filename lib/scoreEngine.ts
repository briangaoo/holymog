import type { FinalScores, SubScores, VisionScore } from '@/types';

type SubKey = keyof SubScores;

function avg(xs: number[]): number {
  if (xs.length === 0) return 50;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Vision comes from N parallel Grok calls (3 categories per frame, server
 *  averages across frames). Each sub-score is the mean of the relevant fields. */
function visionContribution(v: VisionScore, key: SubKey): number {
  switch (key) {
    case 'jawline':
      return avg([v.jawline_definition, v.chin_definition, v.lip_shape]);
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

/** 5th composite, fields that don't belong to a specific facial region but
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

export function combineScores(vision: VisionScore): FinalScores {
  const jawline = visionContribution(vision, 'jawline');
  const eyes = visionContribution(vision, 'eyes');
  const skin = visionContribution(vision, 'skin');
  const cheekbones = visionContribution(vision, 'cheekbones');
  const presentation = computePresentation(vision);

  const subOverall =
    0.25 * jawline +
    0.2 * eyes +
    0.2 * skin +
    0.15 * cheekbones +
    0.2 * presentation;

  // Weight Grok's holistic judgment heavier than the sub-derived overall.
  // Per-region averages tend to drift down because every weak field counts equally;
  // holistic is what catches "this person is at model tier."
  const finalOverall = 0.4 * subOverall + 0.6 * vision.overall_attractiveness;

  return {
    overall: Math.round(finalOverall),
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
