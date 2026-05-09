import { randomBytes } from 'crypto';

// Crockford-uppercase: 32 chars, drops I/L/O/U for visual disambiguation.
// 32 evenly divides 256 so byte % 32 is uniform.
export const BATTLE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
export const BATTLE_CODE_LENGTH = 6;
export const BATTLE_CODE_REGEX = /^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{6}$/;

export function generateBattleCode(): string {
  const bytes = randomBytes(BATTLE_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < BATTLE_CODE_LENGTH; i++) {
    out += BATTLE_CODE_ALPHABET[bytes[i] % 32];
  }
  return out;
}

/** Normalise user-entered codes: uppercase, strip whitespace + dashes. */
export function normaliseBattleCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidBattleCode(input: string): boolean {
  return BATTLE_CODE_REGEX.test(input);
}
