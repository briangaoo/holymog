import crypto from 'crypto';

/**
 * Minimal RFC 4226 (HOTP) + RFC 6238 (TOTP) implementation. No external
 * deps — uses Node's built-in `crypto`. Deliberately small so the code
 * is auditable end-to-end.
 *
 * Defaults: 6-digit codes, 30s period, SHA-1 (the de-facto standard
 * accepted by every authenticator app — Google Authenticator, Authy,
 * 1Password, Bitwarden, etc).
 *
 * Stored secret is encrypted at rest with AES-256-GCM keyed off
 * AUTH_SECRET, so a database leak alone doesn't compromise users'
 * authenticator seeds.
 */

const DIGITS = 6;
const PERIOD = 30;
const ALGO = 'sha1';
const SECRET_BYTES = 20; // 160-bit, recommended TOTP secret length
const ENC_ALGO = 'aes-256-gcm';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ---- Public API -----------------------------------------------------------

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(SECRET_BYTES));
}

/** Generate the current TOTP code for a given secret. Used in tests + setup. */
export function totpCode(secret: string, time: number = Date.now()): string {
  return hotp(secret, Math.floor(time / 1000 / PERIOD));
}

/** Verify a code against a secret with ±1-step skew tolerance (≈ ±30s). */
export function totpVerify(
  secret: string,
  code: string,
  time: number = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(time / 1000 / PERIOD);
  for (let skew = -1; skew <= 1; skew++) {
    try {
      if (timingSafeStringEq(hotp(secret, counter + skew), code)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Build the otpauth:// URI authenticator apps consume on enrollment. */
export function totpUri(args: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const issuer = encodeURIComponent(args.issuer);
  const account = encodeURIComponent(args.account);
  const params = new URLSearchParams({
    secret: args.secret,
    issuer: args.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${issuer}:${account}?${params.toString()}`;
}

/** Generate `n` 8-character lowercase backup codes. Stored hashed. */
export function generateBackupCodes(n: number = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(crypto.randomBytes(4).toString('hex')); // 8 hex chars
  }
  return out;
}

/** SHA-256 a backup code for storage. Use when verifying user input. */
export function hashBackupCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.trim().toLowerCase())
    .digest('hex');
}

// ---- Encryption (AES-256-GCM) ---------------------------------------------

/**
 * Encrypt the TOTP secret before persisting. Format:
 *   <iv:b64url>.<auth_tag:b64url>.<ciphertext:b64url>
 * Decryption rejects anything that doesn't round-trip through the GCM tag.
 */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

export function decryptSecret(encrypted: string): string {
  const [ivB64, tagB64, ctB64] = encrypted.split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed_secret');
  const key = encryptionKey();
  const decipher = crypto.createDecipheriv(
    ENC_ALGO,
    key,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

// ---- HMAC-signed change tokens (used by /api/account/email) ----------------

/**
 * Generic HMAC token format. Used to sign sensitive state-change links
 * (email change, future password reset etc) without a DB table.
 *
 *   tokenize({ userId, ... }, ttlMs) → "<b64url(payload)>.<b64url(sig)>"
 */
export function tokenize(
  payload: Record<string, unknown>,
  ttlMs: number,
): string {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const json = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', authSecret())
    .update(json)
    .digest('base64url');
  return `${json}.${sig}`;
}

export function detokenize<T extends Record<string, unknown>>(
  token: string,
): (T & { exp: number }) | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', authSecret())
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  let parsed: (T & { exp: number }) | null = null;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as
      | (T & { exp: number })
      | null;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.exp !== 'number') return null;
  if (Date.now() > parsed.exp) return null;
  return parsed;
}

// ---- Internals ------------------------------------------------------------

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s)
    throw new Error('AUTH_SECRET not configured — required for TOTP encryption');
  return s;
}

function encryptionKey(): Buffer {
  // Derive a stable 32-byte AES-256 key from AUTH_SECRET via SHA-256.
  return crypto.createHash('sha256').update(authSecret()).digest();
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(ALGO, key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32.indexOf(cleaned[i]);
    if (idx === -1) throw new Error('invalid_base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
