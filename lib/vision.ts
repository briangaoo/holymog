import type { VisionScore } from '@/types';

const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_MODEL = 'grok-4-1-fast-reasoning';

const ANCHOR_RUBRIC = `Use the FULL 0-100 range. Most ordinary adults fall in the 35-65 range.
Reserve 80+ for genuinely above-average. Reserve 90+ for top 1% (model-tier).
Be honest and specific — do not anchor toward 70-90.

Anchor scale (apply to every field):
  95-100  Top 0.1%. Outlier. Magazine cover, A-list celebrity.
  85-94   Top 5%. Fashion-model tier.
  70-84   Above average. Clearly attractive but not exceptional.
  50-69   Average. Most adults.
  30-49   Below average. Imperfections, weak features.
  10-29   Distorted, contorted, or major flaws.
  0-9     Severely distorted/contorted.

Distortion checklist — if ANY are present, score 15-35 across EVERY field, ignore the anchor scale:
  - recessed/jutted jaw, double chin from posture
  - mouth contorted, jaw open, tongue out
  - eyes closed or squinting unnaturally
  - hair deliberately covering eyes/forehead
  - head turned > 15° from camera
  - exaggerated expression`;

const STRICT_PREFIX = 'OUTPUT VALID JSON ONLY. NO PROSE.\n\n';

/* ---------------------------- Three category prompts ---------------------- */

const STRUCTURE_KEYS = [
  'jawline_definition',
  'chin_definition',
  'cheekbone_prominence',
  'nose_shape',
  'nose_proportion',
  'forehead_proportion',
  'temple_hollow',
  'ear_shape',
  'facial_thirds_visual',
] as const;

const STRUCTURE_PROMPT = `You are a strict facial-aesthetic analyzer focused ONLY on BONE STRUCTURE and PROPORTIONS.

${ANCHOR_RUBRIC}

Score each (integer 0-100):
  jawline_definition     sharpness/squareness of the jawline
  chin_definition        chin projection, point quality, tip definition
  cheekbone_prominence   malar projection, definition under the eye
  nose_shape             tip shape, bridge profile, overall nose aesthetics
  nose_proportion        size relative to the rest of the face
  forehead_proportion    size, hairline placement, overall shape
  temple_hollow          temporal area: full = high score, sunken = low
  ear_shape              ear aesthetics (skip → score 70 if not visible)
  facial_thirds_visual   balance of upper / middle / lower face

Output ONLY this JSON (no prose, no markdown):
{
  "jawline_definition": <int>,
  "chin_definition": <int>,
  "cheekbone_prominence": <int>,
  "nose_shape": <int>,
  "nose_proportion": <int>,
  "forehead_proportion": <int>,
  "temple_hollow": <int>,
  "ear_shape": <int>,
  "facial_thirds_visual": <int>
}`;

const FEATURES_KEYS = [
  'eye_size',
  'eye_shape',
  'eye_bags',
  'canthal_tilt',
  'iris_appeal',
  'brow_shape',
  'brow_thickness',
  'lip_shape',
  'lip_proportion',
  'smile_quality',
  'philtrum',
] as const;

const FEATURES_PROMPT = `You are a strict facial-aesthetic analyzer focused ONLY on individual FACIAL FEATURES (eyes, brows, lips, nose details).

${ANCHOR_RUBRIC}

Score each (integer 0-100):
  eye_size            appropriateness of eye size for the face
  eye_shape           almond quality, attractive eye shape
  eye_bags            ABSENCE of dark circles / under-eye bags (100 = none, 20 = severe)
  canthal_tilt        aesthetic appeal of canthal tilt (positive tilt scores higher)
  iris_appeal         iris color/clarity (skip → score 70 if not visible)
  brow_shape          brow arch quality
  brow_thickness      appropriate fullness for the face
  lip_shape           definition, vermilion border, cupid's bow
  lip_proportion      balance of upper vs lower lip
  smile_quality       smile aesthetics (not smiling → score 50)
  philtrum            philtrum length and shape

Output ONLY this JSON (no prose, no markdown):
{
  "eye_size": <int>,
  "eye_shape": <int>,
  "eye_bags": <int>,
  "canthal_tilt": <int>,
  "iris_appeal": <int>,
  "brow_shape": <int>,
  "brow_thickness": <int>,
  "lip_shape": <int>,
  "lip_proportion": <int>,
  "smile_quality": <int>,
  "philtrum": <int>
}`;

const SURFACE_KEYS = [
  'skin_clarity',
  'skin_evenness',
  'skin_tone',
  'hair_quality',
  'hair_styling',
  'posture',
  'confidence',
  'masculinity_femininity',
  'symmetry',
  'feature_harmony',
  'overall_attractiveness',
] as const;

const SURFACE_PROMPT = `You are a strict facial-aesthetic analyzer focused ONLY on SKIN, HAIR, POSE, and HOLISTIC quality.

${ANCHOR_RUBRIC}

Score each (integer 0-100):
  skin_clarity            smoothness, lack of acne / blemishes / scars
  skin_evenness           tone consistency across the face
  skin_tone               health, glow, complexion appeal
  hair_quality            thickness, health, natural condition
  hair_styling            cut/style quality and how it flatters the face
  posture                 head and shoulder pose; tall and aligned scores higher
  confidence              expressed confidence / aura (subjective but score honestly)
  masculinity_femininity  degree of strong gender alignment (high = strongly aligned to either)
  symmetry                bilateral matching of all features
  feature_harmony         how well all features work together as a whole
  overall_attractiveness  HOLISTIC single-number aesthetic judgment

Output ONLY this JSON (no prose, no markdown):
{
  "skin_clarity": <int>,
  "skin_evenness": <int>,
  "skin_tone": <int>,
  "hair_quality": <int>,
  "hair_styling": <int>,
  "posture": <int>,
  "confidence": <int>,
  "masculinity_femininity": <int>,
  "symmetry": <int>,
  "feature_harmony": <int>,
  "overall_attractiveness": <int>
}`;

/* ----------------------------- helpers ------------------------------------ */

type XaiChoice = { message?: { content?: string | Array<{ type?: string; text?: string }> } };
type XaiResponse = { choices?: XaiChoice[] };

function tryParseJSON(text: string): unknown {
  let trimmed = text.trim();
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
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

function validateCategory<K extends string>(
  obj: unknown,
  keys: readonly K[],
): Record<K, number> | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const n = Math.round(v);
    if (n < 0 || n > 100) return null;
    out[k] = n;
  }
  return out;
}

async function callGrok(dataUrl: string, prompt: string): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set');
  const model = process.env.XAI_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(XAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`xAI ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as XaiResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  }
  return '';
}

async function callCategory<K extends string>(
  dataUrl: string,
  prompt: string,
  keys: readonly K[],
): Promise<Record<K, number> | null> {
  try {
    const text = await callGrok(dataUrl, prompt);
    const parsed = validateCategory(tryParseJSON(text), keys);
    if (parsed) return parsed;
    const text2 = await callGrok(dataUrl, STRICT_PREFIX + prompt);
    return validateCategory(tryParseJSON(text2), keys);
  } catch {
    return null;
  }
}

function neutralFor<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = 50;
  return out;
}

/* ------------------------------- public API ------------------------------- */

export async function analyzeFace(blob: Blob): Promise<VisionScore> {
  const ab = await blob.arrayBuffer();
  const base64 = Buffer.from(ab).toString('base64');
  const mime = blob.type || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${base64}`;

  const [structure, features, surface] = await Promise.all([
    callCategory(dataUrl, STRUCTURE_PROMPT, STRUCTURE_KEYS),
    callCategory(dataUrl, FEATURES_PROMPT, FEATURES_KEYS),
    callCategory(dataUrl, SURFACE_PROMPT, SURFACE_KEYS),
  ]);

  const anyFailed = !structure || !features || !surface;

  const merged: VisionScore = {
    ...(structure ?? neutralFor(STRUCTURE_KEYS)),
    ...(features ?? neutralFor(FEATURES_KEYS)),
    ...(surface ?? neutralFor(SURFACE_KEYS)),
    ...(anyFailed ? { fallback: true } : {}),
  } as VisionScore;

  return merged;
}
