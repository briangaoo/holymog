import type { Transporter } from 'nodemailer';
import { recordEmailSent } from '@/lib/emailVolume';

/**
 * Gmail Workspace SMTP wrapper. All transactional email (magic-link
 * sign-in via Auth.js, email-change verification, cron-driven digests,
 * leaderboard-displaced alerts, S-tier review notifications to admin,
 * contact-form forwarding) flows through this single send function.
 *
 * Auth.js's Nodemailer provider has its own copy of the transport
 * config in lib/auth.ts — we deliberately don't share state, because
 * Auth.js manages its own connection pool internally. This module is
 * for everything else.
 *
 * Returns `{ ok: false, error: 'smtp_unconfigured' }` when
 * EMAIL_SERVER_PASSWORD is missing — keeps local dev working without
 * a real Google app password.
 */

let cachedTransport: Transporter | null = null;

async function getTransport(): Promise<Transporter | null> {
  if (cachedTransport) return cachedTransport;
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT ?? 465);
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!host || !user || !pass) return null;
  const nodemailer = await import('nodemailer');
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransport;
}

const FROM_DEFAULT = process.env.EMAIL_FROM ?? 'auth@holymog.com';

export type EmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<EmailResult> {
  const transport = await getTransport();
  if (!transport) return { ok: false, error: 'smtp_unconfigured' };

  // Custom tags survive as X-headers. Gmail preserves them through
  // delivery and they're useful for inbox-side filtering or reply
  // routing without affecting deliverability scoring.
  const headers: Record<string, string> = {};
  for (const tag of args.tags ?? []) {
    headers[`X-${tag.name}`] = tag.value;
  }

  try {
    const result = await transport.sendMail({
      from: args.from ?? FROM_DEFAULT,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
      headers,
    });
    const failed = result.rejected
      .concat(result.pending ?? [])
      .filter(Boolean);
    if (failed.length) {
      return { ok: false, error: `SMTP rejected: ${failed.join(', ')}` };
    }
    void recordEmailSent();
    return { ok: true, id: result.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'send_failed',
    };
  }
}

/**
 * Verify the cron Authorization header. Vercel automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` on cron-triggered requests; we
 * reject anything else with 401 so cron URLs aren't open to the world.
 *
 * In dev (no CRON_SECRET) we accept the request without auth — useful
 * for testing via curl. Production must have CRON_SECRET set.
 */
export function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

/**
 * Public-facing app URL for email links. Falls back to the canonical
 * holymog.com if NEXT_PUBLIC_APP_URL is unset.
 */
export function appUrl(path: string = ''): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://holymog.com';
  return `${base.replace(/\/$/, '')}${path}`;
}
