import type { VisionScore } from '@/types';

const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
// Grok 4.20 non-reasoning, better per-call quality than 4.1, ~0.7-0.9s.
// Paired with 2-frame averaging that's 6 calls in parallel ≈ ~1.5s wall.
const DEFAULT_MODEL = 'grok-4.20-0309-non-reasoning';

const ANCHOR_RUBRIC = `CRITICAL CALIBRATION, read carefully.

Imagine ranking the face you're scoring against 1,000 random adults. The score reflects this rank:

  Rank 1      (top 0.1%, the absolute peak)                    → 99-100
  Rank 2-15   (top 1.5%, working pro fashion model territory)  → 95-99
  Rank 16-50  (top 5%, "could book modeling work")             → 88-94
  Rank 51-150 (top 15%, "hot", strangers compliment)           → 80-87
  Rank 151-350 (top 35%, above average / cute)                 → 70-79
  Rank 351-650 (the middle 30%, average, median person)       → 55-69
  Rank 651-800 (slightly below average, plain)                 → 42-54
  Rank 801-900 (notably unattractive)                          → 28-41
  Rank 901-970 (significantly unattractive)                    → 14-27
  Rank 971-995 (severely flawed)                               → 5-13
  Rank 996-1000                                                → 0-4

If the face has the structural hallmarks of a working professional fashion model
- sharp jawline, defined cheekbones, hunter eyes / strong canthal tilt, balanced
proportions, clear skin, strong overall harmony, they are AT MINIMUM 95.
Top-tier working models hit 96-98. The 99-100 range is reserved for the single
most exceptional outlier. Do NOT park at 92-94 thinking "could book work", if
the face is at that level, it IS pro model material, score 95+.

Default bias: when in doubt between two adjacent bands for an attractive face, choose
the HIGHER band. The score reflects the FACE, not the photo quality.

For attractive faces, EXPECT many features to score 90+ together. Real beauty is
high across multiple dimensions, do not artificially lower features to "spread"
the scores. Spread is fine when there's a real weakness; it's wrong when there isn't.

For unattractive faces, EXPECT many features to score below 50 together. Real flaws
compound, do not artificially raise features to "spread" the scores upward.

EXPRESSION & POSE, read carefully.

PROFESSIONAL EDITORIAL POSE (score HIGHER, +3-8 points across
jawline_definition, cheekbone_prominence, canthal_tilt, feature_harmony,
and overall_attractiveness when several are present):

  - SLIGHT EYE SQUINT — eyelids deliberately narrowed (NOT closed). Orbital
    muscles tighten; the eye shape becomes more defined and the gaze reads
    as intense rather than wide-open. This is the "hunter eyes" pose used
    in fashion editorial.
  - PURSED OR INWARDLY-SUCKED LIPS — lip border crisply defined, no relaxed
    puffy mouth. Slight inward draw of the upper lip is common.
  - HOLLOWED CHEEKS — cheeks drawn inward (light buccal suction). Casts a
    shadow directly under the malar bone and exaggerates cheekbone
    prominence.
  - NEUTRAL OR COLD STARE — no cheek-lift, no smile, no soft openness.
    Maintains the architecture of the lower face.
  - MILD JAW CLENCH — masseter slightly engaged, jaw edge sharper and more
    visible against the cheek.
  - SLIGHT CHIN-DOWN TILT — head angled fractionally down so the brow ridge
    and lower jaw both appear stronger.

These six poses, in any combination, are what working-pro fashion editorial
uses. They REVEAL bone structure rather than hiding it. A face deliberately
combining several of them is BOTH demonstrating aesthetic awareness AND
showing you a more accurate picture of its underlying rank. Score it higher.

SMILING DOES NOT RAISE SCORES. A smile relaxes the jaw, fills the cheeks,
narrows the eyes from BELOW (cheek-lift, the opposite of an orbital squint),
and spreads the lips. It HIDES the bone structure that determines top-tier
rank. Score the structure you can infer underneath the smile, but do NOT
add any warmth or charisma bonus — top-tier model editorial almost never
smiles, precisely because smiling masks rank.

LIGHTING / ANGLE / PARTIAL OBSCURITY is NOT a flaw. Don't penalize a feature
you can't see well — score 60-70 instead of low.

CROPPED OR OUT-OF-FRAME features (e.g. ears not visible) → 70.

DELIBERATE distortion is different from the editorial poses above. Apply
the checklist below ONLY for these:

Distortion checklist (deliberately ugly, NOT the editorial poses above) —
if ANY are present, score 5-25 across EVERY field, ignore the rank scale:
  - recessed/jutted jaw, double chin from posture
  - mouth contorted unnaturally, jaw fully open with no purpose, tongue out
  - eyes squeezed FULLY SHUT (NOT the same as a confident orbital squint)
  - hair deliberately covering eyes/forehead with no styling intent
  - head turned > 25° from camera
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
type XaiUsage = { prompt_tokens?: number; completion_tokens?: number };
type XaiResponse = { choices?: XaiChoice[]; usage?: XaiUsage };

export type TokenUsage = { input: number; output: number };

function emptyTokens(): TokenUsage {
  return { input: 0, output: 0 };
}

function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input: a.input + b.input, output: a.output + b.output };
}

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

type GrokCallOptions = {
  detail?: 'high' | 'low';
  model?: string;
};

async function callGrok(
  dataUrl: string,
  prompt: string,
  options: GrokCallOptions = {},
): Promise<{ text: string; tokens: TokenUsage }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set');
  const model = options.model ?? process.env.XAI_MODEL ?? DEFAULT_MODEL;
  const detail = options.detail ?? 'high';

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
            { type: 'image_url', image_url: { url: dataUrl, detail } },
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
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  }
  const tokens: TokenUsage = {
    input: data.usage?.prompt_tokens ?? 0,
    output: data.usage?.completion_tokens ?? 0,
  };
  return { text, tokens };
}

async function callCategory<K extends string>(
  dataUrl: string,
  prompt: string,
  keys: readonly K[],
): Promise<{ result: Record<K, number> | null; tokens: TokenUsage }> {
  let tokens = emptyTokens();
  try {
    const first = await callGrok(dataUrl, prompt);
    tokens = addTokens(tokens, first.tokens);
    const parsed = validateCategory(tryParseJSON(first.text), keys);
    if (parsed) return { result: parsed, tokens };

    const second = await callGrok(dataUrl, STRICT_PREFIX + prompt);
    tokens = addTokens(tokens, second.tokens);
    return { result: validateCategory(tryParseJSON(second.text), keys), tokens };
  } catch {
    return { result: null, tokens };
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

export async function analyzeFace(blob: Blob): Promise<{ vision: VisionScore; tokens: TokenUsage }> {
  const dataUrl = await blobToDataUrl(blob);

  const [structure, features, surface] = await Promise.all([
    callCategory(dataUrl, STRUCTURE_PROMPT, STRUCTURE_KEYS),
    callCategory(dataUrl, FEATURES_PROMPT, FEATURES_KEYS),
    callCategory(dataUrl, SURFACE_PROMPT, SURFACE_KEYS),
  ]);

  const tokens = [structure, features, surface].reduce(
    (acc, c) => addTokens(acc, c.tokens),
    emptyTokens(),
  );
  const anyFailed = !structure.result || !features.result || !surface.result;

  const vision = {
    ...(structure.result ?? neutralFor(STRUCTURE_KEYS)),
    ...(features.result ?? neutralFor(FEATURES_KEYS)),
    ...(surface.result ?? neutralFor(SURFACE_KEYS)),
    ...(anyFailed ? { fallback: true } : {}),
  } as VisionScore;

  return { vision, tokens };
}

/**
 * Analyze N face frames in parallel and average the per-field scores.
 * Tokens are summed across all underlying calls.
 */
export async function analyzeFaces(
  blobs: Blob[],
): Promise<{ vision: VisionScore; tokens: TokenUsage }> {
  if (blobs.length === 0) throw new Error('analyzeFaces requires at least 1 blob');

  const results = await Promise.all(blobs.map((b) => analyzeFace(b)));
  const tokens = results.reduce((acc, r) => addTokens(acc, r.tokens), emptyTokens());
  const anyFallback = results.some((r) => r.vision.fallback);

  const out = {} as Record<string, number>;
  for (const k of ALL_KEYS) {
    let sum = 0;
    for (const r of results) sum += r.vision[k] as number;
    out[k] = Math.round(sum / results.length);
  }

  return {
    vision: {
      ...(out as unknown as VisionScore),
      ...(anyFallback ? { fallback: true } : {}),
    },
    tokens,
  };
}

/* --------------------------- Quick (live) score --------------------------- */

const QUICK_PROMPT = `Score this face's overall attractiveness 0-100. Use this rank scale (rank 1 = most attractive of 1000 random adults):
  Rank 1      → 99-100        Rank 2-15   → 95-99   (working pro model)
  Rank 16-50  → 88-94          Rank 51-150 → 80-87  (hot)
  Rank 151-350 → 70-79          Rank 351-650 → 55-69 (median)
  Rank 651-800 → 42-54          Rank 801-900 → 28-41
  Rank 901-970 → 14-27          Rank 971-995 → 5-13   Rank 996-1000 → 0-4
If the face is clearly making a deliberately distorted/contorted face (eyes fully squeezed shut, jaw recessed, tongue out, hair pulled over face), score 5-25.

A working-pro fashion editorial pose — neutral or cold stare, slight orbital squint (eyes deliberately narrowed, NOT closed), pursed/inwardly-sucked lips, cheeks drawn inward to expose cheekbone shadow, mild jaw clench, slight chin-down tilt — is the model-tier pose. SCORE IT HIGHER, not lower. Smiling does NOT raise the score; it hides bone structure and is rare in editorial.

Output ONLY: {"overall": <integer 0-100>}`;

export async function analyzeQuick(
  blob: Blob,
): Promise<{ overall: number; tokens: TokenUsage }> {
  const dataUrl = await blobToDataUrl(blob);

  const { text, tokens } = await callGrok(dataUrl, QUICK_PROMPT, {
    detail: 'low',
  });

  const parsed = tryParseJSON(text) as { overall?: number } | null;
  let overall = 50;
  if (parsed && typeof parsed.overall === 'number' && Number.isFinite(parsed.overall)) {
    overall = Math.max(0, Math.min(100, Math.round(parsed.overall)));
  }
  return { overall, tokens };
}
