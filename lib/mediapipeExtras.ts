import type { FaceLandmarkerResult, Category, Matrix } from '@mediapipe/tasks-vision';
import type { Blendshapes, HeadPose } from '@/types';

const BLENDSHAPE_KEYS = [
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'jawOpen',
  'jawForward',
  'jawLeft',
  'jawRight',
  'mouthFunnel',
  'mouthPucker',
  'mouthLeft',
  'mouthRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthRollLower',
  'mouthRollUpper',
  'cheekPuff',
] as const satisfies readonly (keyof Blendshapes)[];

function emptyBlendshapes(): Blendshapes {
  return {
    eyeBlinkLeft: 0,
    eyeBlinkRight: 0,
    eyeSquintLeft: 0,
    eyeSquintRight: 0,
    jawOpen: 0,
    jawForward: 0,
    jawLeft: 0,
    jawRight: 0,
    mouthFunnel: 0,
    mouthPucker: 0,
    mouthLeft: 0,
    mouthRight: 0,
    mouthStretchLeft: 0,
    mouthStretchRight: 0,
    mouthRollLower: 0,
    mouthRollUpper: 0,
    cheekPuff: 0,
  };
}

export function extractBlendshapes(
  result: FaceLandmarkerResult | undefined,
): Blendshapes {
  const out = emptyBlendshapes();
  const cats = result?.faceBlendshapes?.[0]?.categories as Category[] | undefined;
  if (!cats) return out;
  const allowed = new Set<string>(BLENDSHAPE_KEYS);
  for (const c of cats) {
    if (c.categoryName && allowed.has(c.categoryName)) {
      out[c.categoryName as keyof Blendshapes] = c.score;
    }
  }
  return out;
}

/**
 * Extract Euler angles (degrees) from MediaPipe's facial transformation matrix.
 * MediaPipe returns a row-major 4×4 transform; the top-left 3×3 is the rotation.
 * We use a Y(yaw)-X(pitch)-Z(roll) decomposition: positive yaw = head turned to
 * subject's left, positive pitch = chin down, positive roll = head tilt to subject's left.
 */
export function extractHeadPose(result: FaceLandmarkerResult | undefined): HeadPose {
  const matrix = result?.facialTransformationMatrixes?.[0] as Matrix | undefined;
  const m = matrix?.data;
  if (!m || m.length < 11) return { yaw: 0, pitch: 0, roll: 0 };

  // row-major rotation indices
  const r02 = m[2];
  const r12 = m[6];
  const r10 = m[4];
  const r11 = m[5];
  const r22 = m[10];

  const yaw = Math.atan2(r02, r22);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, r12)));
  const roll = Math.atan2(r10, r11);

  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  return { yaw: toDeg(yaw), pitch: toDeg(pitch), roll: toDeg(roll) };
}
