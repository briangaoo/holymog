export type Landmark = { x: number; y: number; z: number };

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
  jawline_definition: number;
  eye_proportion: number;
  skin_clarity: number;
  cheekbone_prominence: number;
  symmetry: number;
  feature_harmony: number;
  fallback?: boolean;
};

export type FinalScores = {
  overall: number;
  sub: SubScores;
};

export type FlowState =
  | { type: 'idle' }
  | { type: 'streaming' }
  | { type: 'detected'; stableSince: number }
  | { type: 'capturing' }
  | { type: 'mapping'; capturedImage: string; landmarks: Landmark[] }
  | { type: 'revealing'; scores: FinalScores }
  | { type: 'complete'; scores: FinalScores }
  | { type: 'error'; message: string };

export type FlowAction =
  | { type: 'CAMERA_READY' }
  | { type: 'FACE_LOST' }
  | { type: 'FACE_STABLE' }
  | { type: 'CAPTURE'; image: string; landmarks: Landmark[] }
  | { type: 'MAPPING_DONE'; scores: FinalScores }
  | { type: 'REVEAL_DONE' }
  | { type: 'RETAKE' }
  | { type: 'ERROR'; message: string };

export type TierInfo = {
  letter: string;
  color: string;
  isGradient: boolean;
  glow: boolean;
};
