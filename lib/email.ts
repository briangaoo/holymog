/**
 * Resend HTTP client wrapper. We use the REST API directly (no @resend/node
 * dep) so we stay aligned with how Auth.js's Resend provider sends magic
 * links — single vendor, single key, single failure mode.
 *
 * Quietly no-ops when AUTH_RESEND_KEY is unset (local dev without a real
 * Resend account). Returns `{ ok }` so callers can decide whether to log
 * a failure to the audit log.
 */

const FROM_DEFAULT = 'holymog <auth@holymog.com>';

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
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    return { ok: false, error: 'resend_unconfigured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from ?? FROM_DEFAULT,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
        tags: args.tags,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: `resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
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
 * holymog.vercel.app if NEXT_PUBLIC_APP_URL is unset (local dev).
 */
export function appUrl(path: string = ''): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://holymog.vercel.app';
  return `${base.replace(/\/$/, '')}${path}`;
}
