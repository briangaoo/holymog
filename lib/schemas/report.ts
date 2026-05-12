import { z } from 'zod';
import { BattleId } from './common';

/**
 * Closed enum of report reasons. The label shown to the user lives in
 * the client modal; the wire value is one of these. `other` requires
 * a non-empty `details` field server-side.
 */
export const REPORT_REASONS = [
  'cheating',
  'minor',
  'nudity',
  'harassment',
  'spam',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const BattleReportBody = z
  .object({
    battle_id: BattleId,
    reported_user_id: z.string().uuid('invalid_user_id'),
    reason: z.enum(REPORT_REASONS),
    details: z.string().max(1000).optional(),
  })
  .strict()
  .refine((d) => d.reason !== 'other' || (d.details && d.details.trim().length > 0), {
    message: 'details_required_for_other',
    path: ['details'],
  });
