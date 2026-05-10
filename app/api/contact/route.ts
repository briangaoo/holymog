import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { getRatelimit } from '@/lib/ratelimit';
import { readClientIp } from '@/lib/scanLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LEN = 4000;
const TO = process.env.CONTACT_EMAIL ?? 'hello@holymog.com';

/**
 * POST /api/contact { topic, message, email? }
 *
 * Forwards a contact-form submission to the inbox. Signed-in users get
 * their email auto-attached as the reply-to (so we don't need to ask
 * for it again). Anonymous senders supply their own. IP-rate-limited
 * so the form can't be used as a spam relay.
 */
export async function POST(request: Request) {
  const limiter = getRatelimit('accountMutate');
  if (limiter) {
    const ip = readClientIp(request);
    const result = await limiter.limit(`contact:${ip}`);
    if (!result.success) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'too many submissions, try later' },
        { status: 429 },
      );
    }
  }

  let body: { topic?: unknown; message?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const topic =
    typeof body.topic === 'string' ? body.topic.trim().slice(0, 80) : '';
  const message =
    typeof body.message === 'string'
      ? body.message.trim().slice(0, MAX_MESSAGE_LEN)
      : '';
  if (!topic || !message) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'topic + message required' },
      { status: 400 },
    );
  }

  const session = await auth();
  let replyTo: string | null = session?.user?.email ?? null;
  let identifier = session?.user
    ? `signed-in user ${session.user.id} (${session.user.email ?? 'no email'})`
    : 'anonymous';

  if (!replyTo) {
    const provided = typeof body.email === 'string' ? body.email.trim() : '';
    if (!provided || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(provided)) {
      return NextResponse.json(
        { error: 'email_required', message: 'sign in or supply your email' },
        { status: 400 },
      );
    }
    replyTo = provided;
    identifier = `anon ${provided}`;
  }

  const html = `<!doctype html><html><body style="font-family:sans-serif;margin:24px;">
    <h2>contact form: ${escape(topic)}</h2>
    <p><strong>from:</strong> ${escape(identifier)}</p>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f4f4f5;padding:12px;border-radius:8px;">${escape(message)}</pre>
  </body></html>`;
  const text = `contact form — ${topic}\n\nfrom: ${identifier}\n\n${message}`;

  const result = await sendEmail({
    to: TO,
    subject: `[holymog contact] ${topic}`,
    html,
    text,
    replyTo: replyTo ?? undefined,
    tags: [{ name: 'kind', value: 'contact_form' }],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'send_failed', message: 'could not send' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
