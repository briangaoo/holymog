import { z } from 'zod';
import { ImageDataUrl } from './common';

/**
 * /api/score POST. Accepts either a multi-frame array (max 6 frames)
 * or a single legacy imageBase64 field. Validation here is just
 * shape; per-image byte/dimension checks happen later via
 * safeImageUpload / validateAndBlob.
 */
export const ScoreBody = z
  .object({
    images: z.array(ImageDataUrl).min(1).max(6).optional(),
    imageBase64: ImageDataUrl.optional(),
  })
  .strict()
  .refine((d) => Boolean(d.images?.length || d.imageBase64), {
    message: 'missing_image',
  });

export const QuickScoreBody = z
  .object({
    imageBase64: ImageDataUrl,
  })
  .strict();
