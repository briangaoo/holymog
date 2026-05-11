import { z } from 'zod';
import { BattleCode, BattleId, ImageDataUrl } from './common';

export const BattleCreateBody = z.object({}).strict();

export const BattleJoinBody = z
  .object({
    code: BattleCode,
  })
  .strict();

export const BattleStartBody = z
  .object({
    battle_id: BattleId,
  })
  .strict();

export const BattleScoreBody = z
  .object({
    battle_id: BattleId,
    imageBase64: ImageDataUrl,
  })
  .strict();

export const BattleFinishBody = z
  .object({
    battle_id: BattleId,
  })
  .strict();

export const BattleLeaveBody = z
  .object({
    battle_id: BattleId,
  })
  .strict();

export const BattleRematchBody = z
  .object({
    battle_id: BattleId,
  })
  .strict();
