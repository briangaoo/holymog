import { NextResponse } from 'next/server';
import { analyzeQuick } from '@/lib/vision';
import { getRatelimit } from '@/lib/ratelimit';
import { readClientIp } from '@/lib/scanLimit';
import { requireSameOrigin } from '@/lib/originGuard';
import { isScoreKilled } from '@/lib/featureFlags';
import { publicError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

type Body = { imageBase64?: unknown };

function decodeBase64(input: string): Buffer | null {
  const cleaned = input.startsWith('data:')
    ? input.slice(input.indexOf(',') + 1)
    : input;
  try {
    return Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
}

function detectMime(buf: Buffer): string {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Lightweight live-meter endpoint. Single image, single number out, uses
 * detail:low for cheap input. Per-IP rate-limited to bound abuse cost —
 * the scan flow legitimately fires ~5 calls per scan, so 60/min easily
 * accommodates real users while capping a runaway bot at $0.01-ish/min.
 */
export async function POST(request: Request) {
  if (isScoreKilled()) {
    return NextResponse.json(publicError('system_unavailable'), { status: 503 });
  }
  const origin = requireSameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(origin.body, { status: origin.status });
  }
  const ip = readClientIp(request);
  const limiter = getRatelimit('quickScore');
  if (limiter) {
    const result = await limiter.limit(ip);
    if (!result.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.imageBase64 !== 'string') {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }

  const buffer = decodeBase64(body.imageBase64);
  if (!buffer) return NextResponse.json({ error: 'decode_failed' }, { status: 400 });
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 });
  }

  try {
    const mime = detectMime(buffer);
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const blob = new Blob([ab as ArrayBuffer], { type: mime });
    const { overall, tokens } = await analyzeQuick(blob);
    return NextResponse.json(
      { overall },
      {
        headers: {
          'X-Tokens-Input': String(tokens.input),
          'X-Tokens-Output': String(tokens.output),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision_error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
