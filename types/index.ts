export type Landmark = { x: number; y: number; z: number };

export type SubScores = {
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
};

export type VisionScore = {
  // Structure (call 1), bone structure & proportions
  jawline_definition: number;
  chin_definition: number;
  cheekbone_prominence: number;
  nose_shape: number;
  nose_proportion: number;
  forehead_proportion: number;
  temple_hollow: number;
  ear_shape: number;
  facial_thirds_visual: number;

  // Features (call 2), individual focal features
  eye_size: number;
  eye_shape: number;
  eye_bags: number;
  canthal_tilt: number;
  iris_appeal: number;
  brow_shape: number;
  brow_thickness: number;
  lip_shape: number;
  lip_proportion: number;
  philtrum: number;

  // Surface (call 3), skin, hair, pose, holistic
  skin_clarity: number;
  skin_evenness: number;
  skin_tone: number;
  hair_quality: number;
  hair_styling: number;
  posture: number;
  confidence: number;
  masculinity_femininity: number;
  symmetry: number;
  feature_harmony: number;
  overall_attractiveness: number;

  fallback?: boolean;
};

export type FinalScores = {
  overall: number;
  sub: SubScores;
  /** Optional only for backward compatibility with old localStorage entries.
   *  All new scans populate both. */
  presentation?: number;
  vision?: VisionScore;
};

/** A single frame sample captured during the countdown.
 *  We capture two frames spread across the 3-second window and average the
 *  vision call results across them server-side. */
export type Frame = {
  image: string;
  landmarks: Landmark[];
};

export type FlowState =
  | { type: 'idle' }
  | { type: 'streaming' }
  | { type: 'detected'; stableSince: number }
  | { type: 'capturing' }
  | { type: 'mapping'; frames: Frame[] }
  | { type: 'revealing'; scores: FinalScores; capturedImage: string }
  | { type: 'complete'; scores: FinalScores; capturedImage: string }
  | { type: 'error'; message: string };

export type FlowAction =
  | { type: 'CAMERA_READY' }
  | { type: 'FACE_LOST' }
  | { type: 'FACE_STABLE' }
  | { type: 'CAPTURE'; frames: Frame[] }
  | { type: 'MAPPING_DONE'; scores: FinalScores }
  | { type: 'REVEAL_DONE' }
  | { type: 'RETAKE' }
  | { type: 'HYDRATE'; scores: FinalScores; capturedImage: string }
  | { type: 'ERROR'; message: string };

export type TierInfo = {
  letter: string;
  color: string;
  isGradient: boolean;
  glow: boolean;
};
