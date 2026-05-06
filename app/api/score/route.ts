import { NextResponse } from 'next/server';
import { analyzeFace } from '@/lib/vision';
import { getRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_DIM = 256;
const MAX_DIM = 2048;

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

function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  // PNG: bytes 16..23 are width and height (big-endian uint32)
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

export async function POST(request: Request) {
  const limiter = getRatelimit();
  if (limiter) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const result = await limiter.limit(ip);
    if (!result.success) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429 },
      );
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
  if (!buffer) {
    return NextResponse.json({ error: 'decode_failed' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  const dims = readPngDimensions(buffer) ?? readJpegDimensions(buffer);
  if (!dims) {
    return NextResponse.json({ error: 'unsupported_image' }, { status: 415 });
  }
  if (
    dims.w < MIN_DIM ||
    dims.h < MIN_DIM ||
    dims.w > MAX_DIM ||
    dims.h > MAX_DIM
  ) {
    return NextResponse.json({ error: 'bad_dimensions' }, { status: 400 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'vision_unavailable',
        fallback: {
          jawline_definition: 50,
          eye_proportion: 50,
          skin_clarity: 50,
          cheekbone_prominence: 50,
          symmetry: 50,
          feature_harmony: 50,
        },
      },
      { status: 503 },
    );
  }

  try {
    const mime = detectMime(buffer);
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const blob = new Blob([ab as ArrayBuffer], { type: mime });
    const score = await analyzeFace(blob);
    return NextResponse.json(score);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision_error';
    return NextResponse.json(
      {
        error: message,
        fallback: {
          jawline_definition: 50,
          eye_proportion: 50,
          skin_clarity: 50,
          cheekbone_prominence: 50,
          symmetry: 50,
          feature_harmony: 50,
        },
      },
      { status: 502 },
    );
  }
}
