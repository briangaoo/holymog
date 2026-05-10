import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'hm_aid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET not configured — required to sign anon cookies');
  return s;
}

function sign(id: string): string {
  return crypto.createHmac('sha256', secret()).update(id).digest('base64url');
}

function verify(value: string): string | null {
  const dot = value.indexOf('.');
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return id;
}

export async function getAnonymousId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return verify(value);
}

export async function getOrIssueAnonymousId(): Promise<string> {
  const existing = await getAnonymousId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const sig = sign(id);
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: `${id}.${sig}`,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return id;
}
