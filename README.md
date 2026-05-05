# Mogem

AI-powered face rating. F- to S+ tier. Mog or get mogged.

Live: [mogem.vercel.app](https://mogem.vercel.app)

## What it does

Point your camera at your face. After a 3-second countdown, the app captures a frame, traces a live spiderweb of facial landmarks across your face, then drops a tier letter (F- through S+) plus an overall score and four sub-scores (jawline, eyes, skin, cheekbones).

## How the score is computed

Three independent sources are weighted into one final score:

| Source                   | What it does                                                                 | Where it runs |
| ------------------------ | ---------------------------------------------------------------------------- | ------------- |
| **Golden ratio** (`lib/goldenRatio.ts`)   | Six phi-based facial proportion checks (face length/width, IPD/eye width, etc). | client / WASM |
| **Proprietary** (`lib/proprietary.ts`)    | Bilateral symmetry, canthal tilt, gonial angle, facial thirds, facial fifths. | client / WASM |
| **Vision** (`lib/fal.ts`)                 | NVIDIA Nemotron 3 Nano Omni via fal.ai — six 0–100 perceptual scores.         | server        |

`lib/scoreEngine.ts` combines them into the four sub-scores (with weight redistribution when a source returns `null`), and `lib/tier.ts` maps the overall to one of 18 tiers.

## Stack

- Next.js 16 (App Router) · TypeScript strict · Tailwind 4
- React 19, `useReducer` flow state machine — no state library
- `@mediapipe/tasks-vision` for 478-point face landmarking
- `@fal-ai/client` for the vision model
- `@upstash/ratelimit` + `@upstash/redis` (10 req/min/IP)
- Framer Motion + canvas-confetti for the reveal
- Self-hosted Nohemi (sans) and IBM Plex Mono (numbers)

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Then open `http://localhost:3000`. Camera APIs require localhost or HTTPS, so you'll need a tunnel (ngrok, Vercel preview) to test on a phone.

### Required environment variables

```
FAL_KEY=                   # https://fal.ai/dashboard/keys
UPSTASH_REDIS_REST_URL=    # https://console.upstash.com → create Redis DB → REST API
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_APP_URL=       # https://mogem.vercel.app  (used by share)
```

If `FAL_KEY` is missing the API returns a neutral fallback (50s) and the app degrades gracefully. If Upstash is missing the rate limiter is silently disabled (fine for local dev).

## Project layout

```
app/
  layout.tsx              # html shell, metadata, fonts
  page.tsx                # the entire app (single page) + state machine wiring
  globals.css             # tailwind + a few keyframes
  api/score/route.ts      # POST → fal.ai vision
  fonts/nohemi/           # self-hosted Nohemi woff files
components/               # Camera, Countdown, Spiderweb, Reveal, Share, etc
hooks/                    # useFaceDetection, useFlowMachine, useShare
lib/                      # scoring, tier, fal, ratelimit, share image
types/index.ts            # shared types
public/icons/             # brand SVGs (TikTok, IG, Snap, X, Discord)
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel link
vercel env add FAL_KEY
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel deploy --prod
```

Or press the button on Vercel and let the dashboard prompt you for env vars. Upstash can be added through the Marketplace and will auto-provision both env vars.

## Privacy

Photos are sent to fal.ai for analysis once per capture and discarded — Mogem never stores them. The shared image only contains your tier letter; sub-scores and the photo are never shared.
