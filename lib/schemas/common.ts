import { z } from 'zod';

/**
 * Strict cap on data-URL length. 8MB at base64 expansion is ~6MB
 * raw — beyond what any of our upload endpoints would accept after
 * safeImageUpload's own per-kind cap. This is the parser-level
 * pre-filter to avoid even decoding pathological inputs.
 */
export const MAX_DATA_URL_LEN = 10 * 1024 * 1024;

/**
 * data:image/* base64 payload. Accepts png/jpeg/webp/gif/mp4 — the
 * downstream pipeline narrows by endpoint via safeImageUpload.
 */
export const ImageDataUrl = z
  .string()
  .max(MAX_DATA_URL_LEN, 'image_too_large')
  .regex(/^data:(image\/(png|jpe?g|webp|gif)|video\/mp4);base64,[A-Za-z0-9+/=]+$/, 'invalid_image_format');

/**
 * Catalog item slug. Loose by design — exact validation against the
 * registry happens in the catalog DB lookup. Just an obviously-bad
 * string filter.
 */
export const CosmeticSlug = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._-]+$/, 'invalid_slug');

/**
 * 6-char Crockford battle code. Server-side normaliser also exists
 * (lib/battle-code.ts:normaliseBattleCode) but the parser-level
 * regex catches gibberish before any DB query fires.
 */
export const BattleCode = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[\s-]+/g, ''))
  .pipe(z.string().regex(/^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{6}$/, 'invalid_code'));

/**
 * Battle UUID. Postgres UUID format.
 */
export const BattleId = z.string().uuid('invalid_battle_id');

/**
 * Display name: 3-24 chars, lowercase letters / digits / underscores /
 * hyphens. Server-side ALSO checks reserved usernames + uniqueness;
 * this is just the syntactic guard.
 */
export const DisplayName = z
  .string()
  .min(3, 'username_too_short')
  .max(24, 'username_too_long')
  .regex(/^[a-z0-9_-]+$/, 'username_invalid_chars');
