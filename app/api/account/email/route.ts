import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { sendEmail, appUrl } from '@/lib/email';
import { tokenize } from '@/lib/totp';
import { getRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH /api/account/email
 *
 * Initiates an email-address change. Sends a verification link to the
 * NEW address; the change is only committed once the user clicks that
 * link (handled by GET /api/account/email/verify). The OLD email
 * receives an alert so a hijacker can't swap addresses silently.
 *
 * No DB table for change tokens — they're HMAC-signed JWT-style strings
 * containing { user_id, new_email, exp } so we can verify cryptographically
 * without persistence. Stateless flow, retry-safe by design.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Rate-limit so an attacker can't churn through emails.
  const limiter = getRatelimit('username');
  if (limiter) {
    const result = await limiter.limit(`email-change:${session.user.id}`);
    if (!result.success) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Try again later.' },
        { status: 429 },
      );
    }
  }

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.email !== 'string') {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const newEmail = body.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(newEmail)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const pool = getPool();
  const me = await pool.query<{ email: string | null }>(
    `select email from users where id = $1 limit 1`,
    [session.user.id],
  );
  const oldEmail = me.rows[0]?.email ?? null;
  if (newEmail === oldEmail) {
    return NextResponse.json(
      { error: 'same_email', message: 'New email is the same as current.' },
      { status: 409 },
    );
  }

  // Reject if another user already has this email.
  const taken = await pool.query<{ id: string }>(
    `select id from users where lower(email) = $1 and id <> $2 limit 1`,
    [newEmail, session.user.id],
  );
  if (taken.rows.length > 0) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 });
  }

  const token = tokenize(
    { user_id: session.user.id, new_email: newEmail, kind: 'email_change' },
    TOKEN_TTL_MS,
  );
  const verifyUrl = `${appUrl('/api/account/email/verify')}?token=${encodeURIComponent(token)}`;

  // 1. Verification link to the NEW address.
  const verifyMessage = {
    subject: 'verify your new holymog email',
    html: emailChangeHtml(newEmail, verifyUrl),
    text: emailChangeText(newEmail, verifyUrl),
  };
  const sendVerify = await sendEmail({
    to: newEmail,
    subject: verifyMessage.subject,
    html: verifyMessage.html,
    text: verifyMessage.text,
    tags: [{ name: 'kind', value: 'email_change_verify' }],
  });
  if (!sendVerify.ok) {
    return NextResponse.json(
      { error: 'send_failed', message: 'Could not send verification email.' },
      { status: 502 },
    );
  }

  // 2. Alert to the OLD address (best-effort — change still proceeds even
  // if this fails since the new-email click is the actual gate).
  if (oldEmail && oldEmail !== newEmail) {
    void sendEmail({
      to: oldEmail,
      subject: 'an email change was requested on your holymog account',
      html: emailAlertHtml(oldEmail, newEmail),
      text: `someone requested to change your holymog email from ${oldEmail} to ${newEmail}. if this wasn't you, change your password and check your sessions at ${appUrl('/account')}.`,
      tags: [{ name: 'kind', value: 'email_change_alert' }],
    });
  }

  return NextResponse.json({ ok: true, sent_to: newEmail });
}

// ---- Templates ------------------------------------------------------------

function emailChangeHtml(newEmail: string, verifyUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:16px;overflow:hidden;">
    <div style="padding:24px 28px;border-bottom:1px solid #1f1f1f;font-weight:700;">holymog</div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 8px;font-size:20px;">verify your new email</h1>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
        click the button below to confirm <strong style="color:#fff;">${escape(newEmail)}</strong>
        as your holymog email. the link expires in 30 minutes.
      </p>
      <a href="${verifyUrl}" style="display:inline-block;background:#fff;color:#000;font-weight:600;font-size:14px;padding:11px 18px;border-radius:999px;text-decoration:none;">verify email</a>
      <p style="color:#71717a;font-size:11px;line-height:1.6;margin:20px 0 0;">
        if you didn't request this, you can safely ignore the email.
      </p>
    </div>
  </div>
</body></html>`;
}

function emailChangeText(newEmail: string, verifyUrl: string): string {
  return `verify your new holymog email\n\nClick the link below to confirm ${newEmail} as your holymog email. The link expires in 30 minutes.\n\n${verifyUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
}

function emailAlertHtml(oldEmail: string, newEmail: string): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:16px;overflow:hidden;">
    <div style="padding:24px 28px;border-bottom:1px solid #1f1f1f;font-weight:700;">holymog</div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 8px;font-size:20px;">email change requested</h1>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 16px;">
        someone requested to change the email on your holymog account from
        <strong style="color:#fff;">${escape(oldEmail)}</strong> to
        <strong style="color:#fff;">${escape(newEmail)}</strong>.
      </p>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
        the change is only completed once <strong>${escape(newEmail)}</strong>
        clicks the verification link we sent there. if this wasn't you,
        sign in and revoke other sessions.
      </p>
      <a href="${appUrl('/account')}" style="display:inline-block;background:#ef4444;color:#fff;font-weight:600;font-size:14px;padding:11px 18px;border-radius:999px;text-decoration:none;">review my account</a>
    </div>
  </div>
</body></html>`;
}

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
