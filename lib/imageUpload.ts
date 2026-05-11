import sharp from 'sharp';

/**
 * Server-side image safety pipeline.
 *
 * Every user-uploaded image (avatar, banner, leaderboard photo)
 * passes through this before hitting storage. Three goals:
 *
 *   1. Strip ALL metadata (EXIF, GPS, camera serial, timestamps,
 *      ICC profiles). Phone cameras embed GPS coordinates by default
 *      and we don't want to publish them on the leaderboard.
 *   2. Re-encode the raster so any embedded malicious payload (a
 *      polyglot file that's both valid PNG and a valid JS payload)
 *      gets normalized into a clean image-only output. sharp pipes
 *      through libvips which decodes + re-encodes from scratch.
 *   3. Cap the spatial dimensions so a 12000x9000 phone selfie can't
 *      be used to fill our storage bucket or DOS clients trying to
 *      load it.
 *
 * sharp throws on truly malformed input (corrupt headers, decode
 * failures). Callers should catch and 400 with `invalid_image`.
 */

export type ImageKind = 'avatar' | 'banner' | 'leaderboard';

type ImageSpec = {
  /** Longest-edge cap. Aspect ratio is preserved. */
  maxDim: number;
  /** Output mime. We always output PNG for avatars (transparent
   *  initial-circle fallbacks) and JPEG everywhere else (smaller). */
  outputMime: 'image/jpeg' | 'image/png';
  /** JPEG quality 0-100 (ignored for PNG). 85 is the sweet spot:
   *  near-indistinguishable from 95 at ~half the bytes. */
  quality: number;
  /** Maximum byte size of the input buffer. Inputs larger than this
   *  are rejected before sharp touches them. */
  maxInputBytes: number;
};

const SPECS: Record<ImageKind, ImageSpec> = {
  avatar: {
    maxDim: 512,
    outputMime: 'image/png',
    quality: 90,
    maxInputBytes: 4 * 1024 * 1024,
  },
  banner: {
    // 3:1 banner at 2400 wide max. 800px tall is the cap on the
    // shorter dimension. sharp .resize() with `fit: 'inside'` keeps
    // aspect ratio.
    maxDim: 2400,
    outputMime: 'image/jpeg',
    quality: 85,
    maxInputBytes: 8 * 1024 * 1024,
  },
  leaderboard: {
    maxDim: 1024,
    outputMime: 'image/jpeg',
    quality: 85,
    maxInputBytes: 4 * 1024 * 1024,
  },
};

export type SafeImageResult = {
  buffer: Buffer;
  mime: 'image/jpeg' | 'image/png';
  ext: 'jpg' | 'png';
  width: number;
  height: number;
};

/**
 * Re-encode an arbitrary input buffer into a safe normalized image.
 *
 * Throws on:
 *   - oversize input (> spec.maxInputBytes)
 *   - decode failure (corrupt / non-image / unsupported format)
 *
 * Returns the clean buffer + true mime + dimensions. EXIF, ICC, XMP,
 * and any other metadata are stripped — sharp drops them by default
 * unless you call `.withMetadata()`, which we never do.
 */
export async function safeImageUpload(
  input: Buffer,
  kind: ImageKind,
): Promise<SafeImageResult> {
  const spec = SPECS[kind];
  if (input.byteLength > spec.maxInputBytes) {
    throw new Error('image_too_large');
  }

  const pipeline = sharp(input, { failOn: 'error' }).rotate(); // auto-orient via EXIF, then strip
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new Error('image_decode_failed');
  }

  // Resize down only — never upscale. fit:'inside' preserves aspect.
  pipeline.resize({
    width: spec.maxDim,
    height: spec.maxDim,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const buffer =
    spec.outputMime === 'image/png'
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: spec.quality, mozjpeg: true }).toBuffer();

  // After resize, re-probe dimensions (the resize op caps them).
  const out = await sharp(buffer).metadata();

  return {
    buffer,
    mime: spec.outputMime,
    ext: spec.outputMime === 'image/png' ? 'png' : 'jpg',
    width: out.width ?? 0,
    height: out.height ?? 0,
  };
}

/**
 * Decode a `data:` URL into a raw buffer + claimed mime. Defensive
 * about malformed prefixes. The claimed mime is NOT trusted — sharp
 * sniffs the actual format from the bytes during re-encode.
 */
export function decodeDataUrl(
  dataUrl: string,
): { buffer: Buffer; claimedMime: string } | null {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.+)$/);
  if (!match) return null;
  const [, claimedMime, isBase64, payload] = match;
  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { buffer, claimedMime };
  } catch {
    return null;
  }
}
