import { randomBytes } from 'crypto';

// Crockford-style uppercase: 32 chars, drops I/L/O/U to remove visual ambiguity.
// 32 evenly divides 256 so byte % 32 is uniform.
export const ACCOUNT_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
export const ACCOUNT_KEY_LENGTH = 8;
export const ACCOUNT_KEY_REGEX = /^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{8}$/;

export function generateAccountKey(): string {
  const bytes = randomBytes(ACCOUNT_KEY_LENGTH);
  let out = '';
  for (let i = 0; i < ACCOUNT_KEY_LENGTH; i++) {
    out += ACCOUNT_KEY_ALPHABET[bytes[i] % 32];
  }
  return out;
}

/** Normalise user-entered keys: uppercase, strip whitespace + dashes. */
export function normaliseAccountKey(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidAccountKey(input: string): boolean {
  return ACCOUNT_KEY_REGEX.test(input);
}
