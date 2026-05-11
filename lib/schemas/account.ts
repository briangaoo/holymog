import { z } from 'zod';
import { CosmeticSlug, DisplayName, ImageDataUrl } from './common';

const Url = z.string().max(2048);

const SocialHandle = z.string().max(32);

/**
 * /api/account/me PATCH body. Every field is optional. Server picks
 * the username-change branch when display_name is present; otherwise
 * the field-update branch. socials is a partial merge — keys absent
 * here keep their stored value, keys present with '' clear, keys
 * present with a value set.
 */
export const MePatchBody = z
  .object({
    display_name: DisplayName.optional(),
    bio: z.string().max(240).nullable().optional(),
    location: z.string().max(60).nullable().optional(),
    socials: z
      .object({
        instagram: SocialHandle.optional(),
        x: SocialHandle.optional(),
        snapchat: SocialHandle.optional(),
        tiktok: SocialHandle.optional(),
        discord: SocialHandle.optional(),
      })
      .strict()
      .nullable()
      .optional(),
    hide_photo_from_leaderboard: z.boolean().optional(),
    hide_elo: z.boolean().optional(),
    mute_battle_sfx: z.boolean().optional(),
    weekly_digest: z.boolean().optional(),
    mog_email_alerts: z.boolean().optional(),
  })
  .strict();

export const AvatarPostBody = z
  .object({
    imageBase64: ImageDataUrl,
  })
  .strict();

export const BannerPostBody = z
  .object({
    imageBase64: ImageDataUrl,
  })
  .strict();

export const EquipPostBody = z
  .object({
    slug: CosmeticSlug,
  })
  .strict();

export const UnequipPostBody = z
  .object({
    kind: z.enum(['frame', 'theme', 'flair', 'name_fx']),
  })
  .strict();

export const EmailPatchBody = z
  .object({
    email: z
      .string()
      .toLowerCase()
      .pipe(z.string().email('invalid_email').max(254)),
  })
  .strict();

export const TwoFactorVerifyBody = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'invalid_code'),
  })
  .strict();

export const TwoFactorDisableBody = z
  .object({
    code: z.string().min(4).max(20),
  })
  .strict();

export const RedeemMonthlyBody = z
  .object({
    slug: CosmeticSlug,
  })
  .strict();

export const MigrateScanBody = z
  .object({
    vision: z.record(z.string(), z.number().min(0).max(100)),
  })
  .strict();

export const ContactBody = z
  .object({
    topic: z.string().min(1).max(80),
    message: z.string().min(1).max(4000),
    email: z.string().email().max(254).optional(),
  })
  .strict();

export const AdminGrantBody = z
  .object({
    user_id: z.string().uuid().optional(),
    username: DisplayName.optional(),
    slug: CosmeticSlug,
    source: z.enum(['grant', 'reward', 'purchase']).optional(),
  })
  .strict()
  .refine((d) => Boolean(d.user_id || d.username), {
    message: 'user_id_or_username_required',
  });

export const FollowParam = z
  .object({
    username: DisplayName,
  })
  .strict();

/**
 * /api/leaderboard POST body. After the anti-cheat rewrite, the
 * client no longer sends scores or imageBase64 — only whether they
 * want their face on the public board. Scores come from the server-
 * validated pending_leaderboard_submissions row that /api/score
 * populated during the most recent scan.
 */
export const LeaderboardPostBody = z
  .object({
    include_photo: z.boolean(),
  })
  .strict();

export type AvatarUrl = z.infer<typeof Url>;
