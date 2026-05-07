import type { VisionScore } from '@/types';

const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
// Grok 4.20 non-reasoning — better per-call quality than 4.1, ~0.7-0.9s.
// Paired with 2-frame averaging that's 6 calls in parallel ≈ ~1.5s wall.
const DEFAULT_MODEL = 'grok-4.20-0309-non-reasoning';

const ANCHOR_RUBRIC = `CRITICAL CALIBRATION — read carefully.

Imagine ranking the face you're scoring against 1,000 random adults. The score reflects this rank:

  Rank 1      (top 0.1%, the absolute peak)                    → 99-100
  Rank 2-15   (top 1.5%, working pro fashion model territory)  → 95-99
  Rank 16-50  (top 5%, "could book modeling work")             → 88-94
  Rank 51-150 (top 15%, "hot", strangers compliment)           → 80-87
  Rank 151-350 (top 35%, above average / cute)                 → 70-79
  Rank 351-650 (the middle 30%, average — median person)       → 55-69
  Rank 651-800 (slightly below average, plain)                 → 42-54
  Rank 801-900 (notably unattractive)                          → 28-41
  Rank 901-970 (significantly unattractive)                    → 14-27
  Rank 971-995 (severely flawed)                               → 5-13
  Rank 996-1000                                                → 0-4

If the face has the structural hallmarks of a working professional fashion model
— sharp jawline, defined cheekbones, hunter eyes / strong canthal tilt, balanced
proportions, clear skin, strong overall harmony — they are AT MINIMUM 95.
Top-tier working models hit 96-98. The 99-100 range is reserved for the single
most exceptional outlier. Do NOT park at 92-94 thinking "could book work" — if
the face is at that level, it IS pro model material, score 95+.

Default bias: when in doubt between two adjacent bands for an attractive face, choose
the HIGHER band. The score reflects the FACE, not the photo quality.

For attractive faces, EXPECT many features to score 90+ together. Real beauty is
high across multiple dimensions — do not artificially lower features to "spread"
the scores. Spread is fine when there's a real weakness; it's wrong when there isn't.

For unattractive faces, EXPECT many features to score below 50 together. Real flaws
compound — do not artificially raise features to "spread" the scores upward.

EXPRESSION HANDLING — read carefully:
  - Smiling is NOT a distortion. A natural smile, including showing teeth, should
    not lower any score. Score the UNDERLYING facial structure.
  - When a feature is temporarily reshaped by an expression (lips spread wide while
    smiling, eyes slightly closed from smiling, cheeks raised by a grin), do NOT
    score those features low. Either score the structure as you'd see it neutral,
    or score 65-75 (above-average neutral) if you genuinely cannot tell.
  - Lighting / angle / partial obscurity is also NOT a flaw. Don't penalize a
    feature you can't see well — score 60-70 instead of low.
  - Cropped or out-of-frame features (e.g. ears not visible) → 70.
  - Charisma, photogenic quality, and a warm presence DO count toward
    overall_attractiveness, feature_harmony, and confidence.

DELIBERATE distortion is different — apply the checklist below ONLY for these.

Distortion checklist — if ANY are present, score 5-25 across EVERY field, ignore the rank scale:
  - recessed/jutted jaw, double chin from posture
  - mouth contorted unnaturally, jaw open, tongue out (NOT a normal smile)
  - eyes squeezed shut deliberately
  - hair deliberately covering eyes/forehead
  - head turned > 15° from camera
  - face being pulled / pinched / pushed to look bad on purpose`;

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
      response_format: { type: 'json_object' },
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

const ALL_KEYS = [...STRUCTURE_KEYS, ...FEATURES_KEYS, ...SURFACE_KEYS] as const;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const base64 = Buffer.from(ab).toString('base64');
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export async function analyzeFace(blob: Blob): Promise<VisionScore> {
  const dataUrl = await blobToDataUrl(blob);

  const [structure, features, surface] = await Promise.all([
    callCategory(dataUrl, STRUCTURE_PROMPT, STRUCTURE_KEYS),
    callCategory(dataUrl, FEATURES_PROMPT, FEATURES_KEYS),
    callCategory(dataUrl, SURFACE_PROMPT, SURFACE_KEYS),
  ]);

  const anyFailed = !structure || !features || !surface;

  return {
    ...(structure ?? neutralFor(STRUCTURE_KEYS)),
    ...(features ?? neutralFor(FEATURES_KEYS)),
    ...(surface ?? neutralFor(SURFACE_KEYS)),
    ...(anyFailed ? { fallback: true } : {}),
  } as VisionScore;
}

/**
 * Analyze N face frames in parallel and average the per-field scores.
 */
export async function analyzeFaces(blobs: Blob[]): Promise<VisionScore> {
  if (blobs.length === 0) throw new Error('analyzeFaces requires at least 1 blob');

  const results = await Promise.all(blobs.map((b) => analyzeFace(b)));
  const anyFallback = results.some((r) => r.fallback);

  const out = {} as Record<string, number>;
  for (const k of ALL_KEYS) {
    let sum = 0;
    for (const r of results) sum += r[k] as number;
    out[k] = Math.round(sum / results.length);
  }

  return {
    ...(out as unknown as VisionScore),
    ...(anyFallback ? { fallback: true } : {}),
  };
}
