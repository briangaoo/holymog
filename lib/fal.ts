import { fal } from '@fal-ai/client';
import type { VisionScore } from '@/types';

const VISION_PROMPT = `You are a facial proportionality analyzer. Analyze the face in the image and return ONLY this JSON object, with no surrounding prose, markdown, or explanation:

{
  "jawline_definition": 0-100,
  "eye_proportion": 0-100,
  "skin_clarity": 0-100,
  "cheekbone_prominence": 0-100,
  "symmetry": 0-100,
  "feature_harmony": 0-100
}

Each value is an integer from 0 to 100 representing that feature's quality. Output the JSON only.`;

const STRICT_PREFIX = 'OUTPUT VALID JSON ONLY. NO PROSE.\n\n';

const VISION_KEYS: Array<keyof VisionScore> = [
  'jawline_definition',
  'eye_proportion',
  'skin_clarity',
  'cheekbone_prominence',
  'symmetry',
  'feature_harmony',
];

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (process.env.FAL_KEY) {
    fal.config({ credentials: process.env.FAL_KEY });
  }
  configured = true;
}

function tryParseJSON(text: string): unknown {
  let trimmed = text.trim();
  // Strip ```json fences
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // If the model wrapped JSON in extra prose, find the first {...}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function validate(obj: unknown): VisionScore | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const k of VISION_KEYS) {
    const v = o[k];
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const n = Math.round(v);
    if (n < 0 || n > 100) return null;
    result[k] = n;
  }
  return result as unknown as VisionScore;
}

type FalOutput = { output?: string; text?: string } & Record<string, unknown>;

function extractText(result: unknown): string {
  // fal returns { data: ... } from subscribe — try common shapes
  if (!result || typeof result !== 'object') return '';
  const r = result as { data?: unknown };
  const data = (r.data ?? result) as FalOutput;
  if (typeof data === 'string') return data;
  if (typeof data?.output === 'string') return data.output;
  if (typeof data?.text === 'string') return data.text;
  // Some models return choices/messages
  const anyData = data as Record<string, unknown>;
  if (Array.isArray(anyData.choices)) {
    const first = anyData.choices[0] as Record<string, unknown> | undefined;
    const msg = first?.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === 'string') return msg.content as string;
  }
  return JSON.stringify(data);
}

async function callVision(imageUrl: string, prompt: string): Promise<string> {
  const result = await fal.subscribe('nvidia/nemotron-3-nano-omni/vision', {
    input: { prompt, image_url: imageUrl },
  });
  return extractText(result);
}

export async function uploadImage(blob: Blob): Promise<string> {
  ensureConfigured();
  return fal.storage.upload(blob);
}

export async function analyzeFace(blob: Blob): Promise<VisionScore> {
  ensureConfigured();
  const url = await uploadImage(blob);

  const firstText = await callVision(url, VISION_PROMPT);
  const firstParsed = validate(tryParseJSON(firstText));
  if (firstParsed) return firstParsed;

  const secondText = await callVision(url, STRICT_PREFIX + VISION_PROMPT);
  const secondParsed = validate(tryParseJSON(secondText));
  if (secondParsed) return secondParsed;

  return {
    jawline_definition: 50,
    eye_proportion: 50,
    skin_clarity: 50,
    cheekbone_prominence: 50,
    symmetry: 50,
    feature_harmony: 50,
    fallback: true,
  };
}
