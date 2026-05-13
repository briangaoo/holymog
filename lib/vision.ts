import type { VisionScore } from '@/types';
import { recordCost } from './costCap';

// Google Cloud Vertex AI — Gemini 2.5 Flash Lite via the global
// generateContent endpoint, authenticated with an API key (Vertex AI
// Express-mode). We chose Vertex over AI Studio after hitting
// prepayment-credit-depletion on AI Studio; Vertex bills against the
// linked GCP credit card with no prepay wall, has higher quotas, and
// runs the same model at the same pricing ($0.10/M input, $0.40/M
// output for gemini-2.5-flash-lite).
//
// API-key auth (vs the service-account JWT route) is the cleaner of
// the two Vertex auth flows for our use case: no token caching, no
// google-auth-library dependency, no project/location URL plumbing.
// The key carries the project binding internally.
//
// Differences from AI Studio worth noting in this file:
//   - Endpoint is aiplatform.googleapis.com, not generativelanguage.
//   - Request/response field names are camelCase end-to-end
//     (`inlineData`, `mimeType`, `responseMimeType`, …) where AI
//     Studio's REST surface used snake_case.
//   - Response carries `trafficType` + `modelVersion` extras we
//     ignore.
// Regional endpoint — measured ~1s per call vs ~11s on the global
// `aiplatform.googleapis.com` host. The global endpoint round-trips
// through Google's global LB to a backend region and adds ~10s of
// pure server-side latency on Express-mode requests; pinning the
// region cuts that out. us-central1 is supported for gemini-2.5-flash-lite
// and has US-wide latency parity. Override per-call via
// VERTEX_REGION env var if you want to pin elsewhere later.
const VERTEX_REGION = process.env.VERTEX_REGION ?? 'us-central1';
const VERTEX_API_BASE = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/publishers/google/models`;
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

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

For unattractive faces, EXPECT bone-structure fields to score below 25 together
(jawline_definition, chin_definition, cheekbone_prominence, facial_thirds_visual,
forehead_proportion, temple_hollow, nose_shape, nose_proportion). Real flaws
compound. Do NOT spread scores upward to be charitable. Do NOT let surface fields
(skin_clarity, skin_evenness, skin_tone, hair_quality, hair_styling) inflate the
holistic overall_attractiveness — clear skin and good hair on top of grotesque
bone structure is still grotesque.

STRUCTURAL FAILURE / SEVERELY FLAWED, read carefully.

A face can be SEVERELY FLAWED in its bone structure independent of any pose —
gaunt, sunken, recessive, disproportionate, uncanny, AI-rendered grotesque.
These read as bottom-quartile rank (5-25) regardless of how clear the skin or
how good the hair. Hallmarks (if 2+ are clearly present, the face is in
"severely flawed" territory: rank 901-995, score 5-25 on overall_attractiveness
and on every bone-structure field):

  - Severely sunken cheeks / hollowed-out lower face with no malar fat
  - Bulging or disproportionately large eyes set in deep dark sockets
  - Heavily recessive chin / no chin projection / receding jaw
  - Crushed lower-third (mouth-to-chin distance much shorter than mid-face)
    or stretched upper-third (forehead dominates)
  - Asymmetric to the point of distortion
  - Skeletal cheekbones with no soft tissue support — reads as malnourished
  - Uncanny / not-quite-human / clearly AI-rendered grotesque proportions
  - Heavy nasolabial hollows, gaunt jawline, paper-thin lips on a recessive frame

When you see structural failure, OVERRIDE the surface scores' influence.
overall_attractiveness must reflect the WORST of the structure, not an
average. A face with skin_clarity=80 and chin_definition=10 is NOT a 50.

When 2 or more hallmarks of structural failure are clearly present,
overall_attractiveness lands in the bottom-quartile rank — somewhere in the
5-25 range — pick by severity. Do NOT drift above 25 when the structure is
compromised, no matter how clean the skin is. The exact number inside that
band is a judgment call; what matters is that ugly faces consistently land
under 25, not that any one image hits a specific number.

Do NOT pad these numbers upward because skin/hair are clean. The holistic
judgment anchors on bone structure first, surface second.

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

const CONDITIONS_KEYS = [
  'lighting_quality',
  'outfit_quality',
  'background_quality',
  'framing_composition',
  'mood_aura',
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
  overall_attractiveness  HOLISTIC single-number aesthetic judgment.
                          ANCHOR ON BONE STRUCTURE first, surface second:
                          look at jawline, chin, cheekbones, facial thirds,
                          temple, forehead, nose proportion. If structure is
                          severely flawed (gaunt / recessive / sunken / uncanny
                          / disproportionate), this number is 5-20 EVEN IF
                          skin is clear and hair is healthy. Surface beauty
                          NEVER pulls a structurally failed face above rank
                          901 (score 25). For attractive structure, this
                          number sits at structure_floor + a small surface
                          bonus, not the average of structure and surface.

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

const CONDITIONS_PROMPT = `You are scoring the PHOTO CONDITIONS — the environment and presentation
around the subject, NOT the face itself. These five fields exist to make scans
sensitive to lighting, outfit, background, framing, and overall vibe so the
same person photographed differently gets meaningfully different scores.

Score honestly: a great-looking person in a poorly-lit cluttered selfie should
still score lower here than the same person in a well-composed shot. A weak
face in a stunning editorial setup should still score high HERE (the face is
scored separately, not your job).

Score each (integer 0-100):
  lighting_quality       quality of light on the subject
                         100 = soft, diffused, even, flattering, well-balanced
                         70  = decent natural / studio light, no real issues
                         40  = harsh or flat, color cast, uneven shadows
                         10  = severe over/under-exposure, deep shadows, colour disaster
  outfit_quality         visible clothing aesthetic + grooming statement
                         100 = sharp, styled, intentional, fits well, photo-aware
                         70  = clean and presentable, neutral
                         40  = plain or unstyled, low effort
                         10  = sloppy, mismatched, no effort visible
                         If no clothing is visible at all (face-only crop), score 70.
  background_quality     what's behind the subject
                         100 = clean, intentional, aesthetic, on-brand backdrop
                         70  = neutral wall / unremarkable but not bad
                         40  = cluttered or distracting
                         10  = chaotic, ugly, actively undermines the subject
  framing_composition    how the photo is framed
                         100 = ideal head position, well-cropped, balanced composition
                         70  = centered and unremarkable
                         40  = awkward crop, head too small / too large, off-balance
                         10  = forehead / chin chopped off, weird angle, no thought to composition
  mood_aura              the overall vibe the photo radiates
                         100 = striking, captivating, photogenic energy, "model shot"
                         70  = neutral snapshot, no energy either way
                         40  = uninspired, low-effort selfie energy
                         10  = dead-eye, vibeless, mood-killer

Each axis is independent — score them honestly even if it means low across the
board (genuinely bad photo) or high across the board (genuinely great photo).

Output ONLY this JSON (no prose, no markdown):
{
  "lighting_quality": <int>,
  "outfit_quality": <int>,
  "background_quality": <int>,
  "framing_composition": <int>,
  "mood_aura": <int>
}`;

/* ----------------------------- helpers ------------------------------------ */

type GeminiPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };
type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
};
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
};

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

type GeminiCallOptions = {
  model?: string;
  // Kept for source-call compatibility with the previous Grok client; Gemini
  // doesn't expose a per-call detail knob, so this is currently a no-op.
  detail?: 'high' | 'low';
};

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  // dataUrl format: data:<mime>;base64,<payload>
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma); // strip "data:"
  const semi = header.indexOf(';');
  const mimeType = semi >= 0 ? header.slice(0, semi) : header;
  const base64 = dataUrl.slice(comma + 1);
  return { mimeType: mimeType || 'image/jpeg', base64 };
}

async function callGemini(
  dataUrl: string,
  prompt: string,
  options: GeminiCallOptions = {},
): Promise<{ text: string; tokens: TokenUsage }> {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) throw new Error('VERTEX_API_KEY is not set');
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const { mimeType, base64 } = splitDataUrl(dataUrl);

  // Vertex AI global endpoint. The model identifier is the same
  // string as on AI Studio (e.g. "gemini-2.5-flash-lite"); Vertex
  // wraps it in the publishers/google path. The API key carries the
  // project binding internally — no project ID or region needed in
  // the URL.
  const url =
    `${VERTEX_API_BASE}/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        // 0.5 gives Gemini enough sampling latitude to actually vary
        // scores across re-scans (was 0.2 — near-deterministic), without
        // drifting so far from the JSON schema that parsing falls over.
        // The strict-prefix retry path covers the occasional 0.5 drift.
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vertex ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  const tokens: TokenUsage = {
    input: data.usageMetadata?.promptTokenCount ?? 0,
    output: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
  // Fire-and-forget — record the spend in the daily cost counter so
  // checkBudget() can gate future requests. Failures don't block.
  void recordCost(tokens.input, tokens.output);
  return { text, tokens };
}

async function callCategory<K extends string>(
  dataUrl: string,
  prompt: string,
  keys: readonly K[],
): Promise<{ result: Record<K, number> | null; tokens: TokenUsage }> {
  let tokens = emptyTokens();
  try {
    const first = await callGemini(dataUrl, prompt);
    tokens = addTokens(tokens, first.tokens);
    const parsed = validateCategory(tryParseJSON(first.text), keys);
    if (parsed) return { result: parsed, tokens };

    const second = await callGemini(dataUrl, STRICT_PREFIX + prompt);
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

const ALL_KEYS = [
  ...STRUCTURE_KEYS,
  ...FEATURES_KEYS,
  ...SURFACE_KEYS,
  ...CONDITIONS_KEYS,
] as const;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const base64 = Buffer.from(ab).toString('base64');
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export async function analyzeFace(blob: Blob): Promise<{ vision: VisionScore; tokens: TokenUsage }> {
  const dataUrl = await blobToDataUrl(blob);

  const [structure, features, surface, conditions] = await Promise.all([
    callCategory(dataUrl, STRUCTURE_PROMPT, STRUCTURE_KEYS),
    callCategory(dataUrl, FEATURES_PROMPT, FEATURES_KEYS),
    callCategory(dataUrl, SURFACE_PROMPT, SURFACE_KEYS),
    callCategory(dataUrl, CONDITIONS_PROMPT, CONDITIONS_KEYS),
  ]);

  const tokens = [structure, features, surface, conditions].reduce(
    (acc, c) => addTokens(acc, c.tokens),
    emptyTokens(),
  );
  const anyFailed =
    !structure.result ||
    !features.result ||
    !surface.result ||
    !conditions.result;

  const vision = {
    ...(structure.result ?? neutralFor(STRUCTURE_KEYS)),
    ...(features.result ?? neutralFor(FEATURES_KEYS)),
    ...(surface.result ?? neutralFor(SURFACE_KEYS)),
    ...(conditions.result ?? neutralFor(CONDITIONS_KEYS)),
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

// Live-meter prompt. Kept deliberately short — the heavy 6-call pipeline
// (analyzeFaces) does the real scoring; the quick call only feeds the
// bouncing live-meter readout. ~70 tokens vs the heavy prompt's ~1100.
const QUICK_PROMPT = `Rate this face 0-100 vs random adults.
  95-100  pro-model territory
  85-94   very attractive
  70-84   above average / hot
  50-69   average / median
  30-49   below average
  5-29    distorted face / pulled / contorted

Smiling hides bone structure — don't boost it.
Output ONLY: {"overall": <int 0-100>}`;

export async function analyzeQuick(
  blob: Blob,
): Promise<{ overall: number; tokens: TokenUsage }> {
  const dataUrl = await blobToDataUrl(blob);

  const { text, tokens } = await callGemini(dataUrl, QUICK_PROMPT, {
    detail: 'low',
  });

  const parsed = tryParseJSON(text) as { overall?: number } | null;
  let overall = 50;
  if (parsed && typeof parsed.overall === 'number' && Number.isFinite(parsed.overall)) {
    overall = Math.max(0, Math.min(100, Math.round(parsed.overall)));
  }
  return { overall, tokens };
}

/* --------------------------- Battle score (Phase 2) ----------------------- */

export const BATTLE_IMPROVEMENT_OPTIONS = [
  'jawline',
  'cheekbones',
  'chin',
  'nose',
  'forehead',
  'symmetry',
  'eyes',
  'brows',
  'lips',
  'skin',
  'hair',
] as const;
export type BattleImprovement = (typeof BATTLE_IMPROVEMENT_OPTIONS)[number];

const BATTLE_IMPROVEMENT_SET: ReadonlySet<string> = new Set(BATTLE_IMPROVEMENT_OPTIONS);

const BATTLE_PROMPT = `Score this face's overall attractiveness 0-100 and identify the SINGLE feature most needing improvement.

Rank scale (rank 1 = most attractive of 1000 random adults):
  Rank 1      → 99-100        Rank 2-15   → 95-99   (working pro model)
  Rank 16-50  → 88-94          Rank 51-150 → 80-87  (hot)
  Rank 151-350 → 70-79          Rank 351-650 → 55-69 (median)
  Rank 651-800 → 42-54          Rank 801-900 → 28-41
  Rank 901-970 → 14-27          Rank 971-995 → 5-13   Rank 996-1000 → 0-4

If the face is clearly making a deliberately distorted/contorted expression (eyes fully squeezed shut, jaw recessed, tongue out, hair pulled over face), score 5-25.

A working-pro editorial pose — neutral or cold stare, slight orbital squint (eyes deliberately narrowed, NOT closed), pursed/inwardly-sucked lips, cheeks drawn inward, mild jaw clench, slight chin-down tilt — is the model-tier pose. Score it HIGHER, not lower. Smiling hides bone structure; do not boost smiling.

Pick the improvement label from EXACTLY these eleven options (lowercase, no punctuation):
  jawline, cheekbones, chin, nose, forehead, symmetry, eyes, brows, lips, skin, hair

What each label means (pick the ONE biggest weakness):
  jawline   — undefined edge, weak masseter, soft / round lower face
  cheekbones — flat malar projection, no shadow under the eye
  chin      — recessive, no projection, weak / short lower third
  nose      — bridge bump, bulbous tip, asymmetric, disproportionate
  forehead  — disproportionately tall / short, recessed hairline
  symmetry  — visible left/right mismatch in any feature
  eyes      — flat or negative canthal tilt, hooded / droopy, narrow setting
  brows     — thin, sparse, over-plucked, unkempt, mis-arched
  lips      — thin upper lip, no defined cupid's bow or vermilion border
  skin      — clarity, acne, scarring, texture, dark circles, redness
  hair      — thinning, damaged, unstyled, poor cut, hairline issues

Output ONLY: {"overall": <integer 0-100>, "improvement": "<one of the eleven>"}`;

/**
 * Per-frame battle score: returns a single overall + the area Gemini
 * thinks most needs improvement. Used by /api/battle/score during
 * the 10-second active window. Defensive: if Gemini returns a label
 * outside the enum, coerce to 'eyes' (a neutral fallback).
 */
export async function analyzeBattle(
  blob: Blob,
): Promise<{
  overall: number;
  improvement: BattleImprovement;
  tokens: TokenUsage;
}> {
  const dataUrl = await blobToDataUrl(blob);

  const { text, tokens } = await callGemini(dataUrl, BATTLE_PROMPT, {
    detail: 'low',
  });

  const parsed = tryParseJSON(text) as
    | { overall?: number; improvement?: string }
    | null;

  let overall = 50;
  if (parsed && typeof parsed.overall === 'number' && Number.isFinite(parsed.overall)) {
    overall = Math.max(0, Math.min(100, Math.round(parsed.overall)));
  }

  let improvement: BattleImprovement = 'eyes';
  if (parsed && typeof parsed.improvement === 'string') {
    const candidate = parsed.improvement.toLowerCase().trim();
    if (BATTLE_IMPROVEMENT_SET.has(candidate)) {
      improvement = candidate as BattleImprovement;
    }
  }

  return { overall, improvement, tokens };
}
