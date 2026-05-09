import { NextResponse } from 'next/server';
import { analyzeFaces } from '@/lib/vision';
import { getRatelimit } from '@/lib/ratelimit';
import { combineScores } from '@/lib/scoreEngine';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_DIM = 256;
const MAX_DIM = 2048;
const MAX_IMAGES = 6;

type Body = { imageBase64?: unknown; images?: unknown };

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

function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}

function readJpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    i += 2;
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = buf.readUInt16BE(i);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      const h = buf.readUInt16BE(i + 3);
      const w = buf.readUInt16BE(i + 5);
      return { w, h };
    }
    i += len;
  }
  return null;
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

function validateAndBlob(
  imageBase64: string,
): { blob: Blob } | { error: string; status: number } {
  const buffer = decodeBase64(imageBase64);
  if (!buffer) return { error: 'decode_failed', status: 400 };
  if (buffer.byteLength > MAX_BYTES) return { error: 'image_too_large', status: 413 };
  const dims = readPngDimensions(buffer) ?? readJpegDimensions(buffer);
  if (!dims) return { error: 'unsupported_image', status: 415 };
  if (dims.w < MIN_DIM || dims.h < MIN_DIM || dims.w > MAX_DIM || dims.h > MAX_DIM) {
    return { error: 'bad_dimensions', status: 400 };
  }
  const mime = detectMime(buffer);
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return { blob: new Blob([ab as ArrayBuffer], { type: mime }) };
}

export async function POST(request: Request) {
  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
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

  // Accept either { images: [...] } (multi-frame) or { imageBase64 } (single-image fallback).
  const rawImages: string[] = (() => {
    if (Array.isArray(body.images)) {
      return body.images.filter((x): x is string => typeof x === 'string');
    }
    if (typeof body.imageBase64 === 'string') return [body.imageBase64];
    return [];
  })();

  if (rawImages.length === 0) {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }
  if (rawImages.length > MAX_IMAGES) {
    return NextResponse.json({ error: 'too_many_images' }, { status: 400 });
  }

  const blobs: Blob[] = [];
  for (const img of rawImages) {
    const result = validateAndBlob(img);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    blobs.push(result.blob);
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 });
  }

  try {
    const { vision, tokens } = await analyzeFaces(blobs);

    // Best-scan capture for signed-in users: if the new overall beats
    // their stored best (or they don't have one yet), atomically upsert.
    // Conditional WHERE makes this race-safe even with concurrent scans.
    void persistBestScanIfBeaten(vision);

    return NextResponse.json(vision, {
      headers: {
        'X-Tokens-Input': String(tokens.input),
        'X-Tokens-Output': String(tokens.output),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision_error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function persistBestScanIfBeaten(
  vision: import('@/types').VisionScore,
): Promise<void> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return;

    const final = combineScores(vision);
    const pool = getPool();
    await pool.query(
      `update profiles
          set best_scan = $1::jsonb,
              best_scan_overall = $2
        where user_id = $3
          and (best_scan_overall is null or best_scan_overall < $2)`,
      [
        JSON.stringify({ vision, scores: final }),
        final.overall,
        user.id,
      ],
    );
  } catch {
    // Best-effort; never block the scan response.
  }
}
