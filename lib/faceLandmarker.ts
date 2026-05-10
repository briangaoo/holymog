import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';

let videoLandmarkerPromise: Promise<FaceLandmarker> | null = null;

/**
 * MediaPipe's TFLite WASM prints "INFO: Created TensorFlow Lite XNNPACK
 * delegate for CPU." through Emscripten's `printErr`, which routes to
 * `console.error`. Next.js's dev overlay surfaces every console.error
 * as a red error box even though this is informational — and the print
 * fires asynchronously from the WASM, so a short-window console.error
 * mute around the warmup call doesn't reliably catch it.
 *
 * Permanent fix: install a console.error wrapper at module load that
 * drops only this exact INFO line and lets every other call through
 * unchanged. Idempotent (we tag the wrapper so re-imports don't stack).
 */
const TFLITE_INFO_RE = /INFO:\s*Created TensorFlow Lite XNNPACK delegate/i;

type TaggedConsoleError = typeof console.error & { __holymogTfliteFilter?: true };

function installTfliteInfoFilter() {
  if (typeof console === 'undefined' || typeof window === 'undefined') return;
  const current = console.error as TaggedConsoleError;
  if (current.__holymogTfliteFilter) return;
  const wrapped: TaggedConsoleError = ((...args: unknown[]) => {
    if (typeof args[0] === 'string' && TFLITE_INFO_RE.test(args[0])) return;
    current.apply(console, args as Parameters<typeof console.error>);
  }) as TaggedConsoleError;
  wrapped.__holymogTfliteFilter = true;
  console.error = wrapped;
}

installTfliteInfoFilter();

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (videoLandmarkerPromise) return videoLandmarkerPromise;
  videoLandmarkerPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
    const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      numFaces: 1,
    });
    // Warm up the XNNPACK delegate so the first real detectForVideo call
    // doesn't pay the lazy-init latency cost on the user's first frame.
    // The INFO console.error this triggers is silenced by the filter
    // installed at module load (above), regardless of timing.
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      landmarker.detectForVideo(canvas, performance.now());
    } catch {
      // Expected — blank canvas yields no faces; we only care about
      // side-effects (delegate initialization).
    }
    return landmarker;
  })();
  return videoLandmarkerPromise;
}
