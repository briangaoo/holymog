export type Landmark = { x: number; y: number; z: number };

/** Subset of MediaPipe blendshapes we care about, normalized 0–1. */
export type Blendshapes = {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  eyeSquintLeft: number;
  eyeSquintRight: number;
  jawOpen: number;
  jawForward: number;
  jawLeft: number;
  jawRight: number;
  mouthFunnel: number;
  mouthPucker: number;
  mouthLeft: number;
  mouthRight: number;
  mouthStretchLeft: number;
  mouthStretchRight: number;
  mouthRollLower: number;
  mouthRollUpper: number;
  cheekPuff: number;
};

/** Head orientation in degrees, derived from MediaPipe transform matrix. */
export type HeadPose = { yaw: number; pitch: number; roll: number };

export type CaptureExtras = {
  blendshapes: Blendshapes;
  headPose: HeadPose;
};

export type SubScores = {
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
};

export type PartialSubScores = {
  jawline: number | null;
  eyes: number | null;
  skin: number | null;
  cheekbones: number | null;
};

export type MetricDetail = {
  value: number;
  score: number;
  target?: number | string;
};

export type SourceScore = {
  overall: number;
  sub: PartialSubScores;
  details?: Record<string, MetricDetail>;
};

export type VisionScore = {
  // Structure (call 1) — bone structure & proportions
  jawline_definition: number;
  chin_definition: number;
  cheekbone_prominence: number;
  nose_shape: number;
  nose_proportion: number;
  forehead_proportion: number;
  temple_hollow: number;
  ear_shape: number;
  facial_thirds_visual: number;

  // Features (call 2) — individual focal features
  eye_size: number;
  eye_shape: number;
  eye_bags: number;
  canthal_tilt: number;
  iris_appeal: number;
  brow_shape: number;
  brow_thickness: number;
  lip_shape: number;
  lip_proportion: number;
  smile_quality: number;
  philtrum: number;

  // Surface (call 3) — skin, hair, pose, holistic
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
  /** 5th composite (hair / posture / confidence / harmony / holistic). Optional
   *  for backward compatibility with old localStorage entries. */
  presentation?: number;
  sub: SubScores;
  /** Full Grok breakdown — used by the "more detail" panel. Optional for the
   *  same backward-compat reason. */
  vision?: VisionScore;
};

export type FlowState =
  | { type: 'idle' }
  | { type: 'streaming' }
  | { type: 'detected'; stableSince: number }
  | { type: 'capturing' }
  | {
      type: 'mapping';
      capturedImage: string;
      landmarks: Landmark[];
      extras: CaptureExtras;
    }
  | { type: 'revealing'; scores: FinalScores; capturedImage: string }
  | { type: 'complete'; scores: FinalScores; capturedImage: string }
  | { type: 'error'; message: string };

export type FlowAction =
  | { type: 'CAMERA_READY' }
  | { type: 'FACE_LOST' }
  | { type: 'FACE_STABLE' }
  | { type: 'CAPTURE'; image: string; landmarks: Landmark[]; extras: CaptureExtras }
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
