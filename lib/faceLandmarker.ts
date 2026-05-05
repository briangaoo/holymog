import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Landmark } from '@/types';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';

let videoLandmarkerPromise: Promise<FaceLandmarker> | null = null;

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (videoLandmarkerPromise) return videoLandmarkerPromise;
  videoLandmarkerPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
    return FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      numFaces: 1,
    });
  })();
  return videoLandmarkerPromise;
}

export type LandmarkResult = {
  landmarks: Landmark[];
  faceCount: number;
};
