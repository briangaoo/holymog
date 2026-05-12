import { NextResponse } from 'next/server';
import { sendEmail, verifyCronAuth } from '@/lib/email';
import {
  getEmailCount,
  hasAlertedToday,
  markAlerted,
} from '@/lib/emailVolume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Gmail Workspace SMTP cap is 2,000 messages / 24h per authenticated
 * user. Crossing it returns `421 4.7.0 Try again later` and magic
 * links stop landing. We watch for three consecutive completed days
 * over THRESHOLD (~75% of the cap) — sustained signal, not a
 * one-day spike — and alert the operator to swap to Resend before
 * it bites.
 */
const THRESHOLD = 1200;
const ALERT_RECIPIENT = 'briangaoo2@gmail.com';

/**
 * GET /api/cron/email-volume-check
 *
 * Daily cron. Reads the email-sent counter for the last 3 completed
 * UTC calendar days. If all three crossed THRESHOLD, fires a one-
 * shot alert email (deduped per UTC day so repeat cron invocations
 * don't spam the inbox).
 *
 * Schedule (vercel.json): `0 23 * * *` — 23:00 UTC daily. Late in the
 * day so today's count is mostly settled (we read the *previous*
 * three days, not today, so settlement isn't strictly required).
 *
 * Test mode: `?force=1` bypasses both the threshold check and the
 * per-day dedupe, sending the alert email regardless of volume.
 * Useful for verifying the alert path end-to-end before there's
 * any real traffic.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` per Vercel Cron
 * convention. Anything else gets 401. Dev mode (no CRON_SECRET set)
 * accepts unauthed requests for curl testing.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';

  const [d1, d2, d3] = await Promise.all([
    getEmailCount(1),
    getEmailCount(2),
    getEmailCount(3),
  ]);
  const counts = { yesterday: d1, twoDaysAgo: d2, threeDaysAgo: d3 };
  const crossed = d1 >= THRESHOLD && d2 >= THRESHOLD && d3 >= THRESHOLD;

  if (!force && !crossed) {
    return NextResponse.json({
      ok: true,
      alerted: false,
      reason: 'under_threshold',
      counts,
      threshold: THRESHOLD,
    });
  }

  if (!force && (await hasAlertedToday())) {
    return NextResponse.json({
      ok: true,
      alerted: false,
      reason: 'already_alerted_today',
      counts,
      threshold: THRESHOLD,
    });
  }

  const subject = force
    ? '[holymog] email-volume-check test'
    : '[holymog] email volume crossed alert threshold';

  const html = `
    <p>holymog email volume report:</p>
    <ul>
      <li>Yesterday: <strong>${d1}</strong></li>
      <li>2 days ago: <strong>${d2}</strong></li>
      <li>3 days ago: <strong>${d3}</strong></li>
    </ul>
    <p>${
      force
        ? 'This is a forced test send — threshold check was bypassed.'
        : `All three days crossed the <strong>${THRESHOLD}/day</strong> alert threshold. Gmail Workspace SMTP caps at 2,000/day per authenticated user; you're approaching it.`
    }</p>
    <p><strong>Swap path:</strong> change <code>EMAIL_SERVER_HOST</code>,
    <code>EMAIL_SERVER_USER</code>, and <code>EMAIL_SERVER_PASSWORD</code>
    in Vercel env vars to your Resend SMTP credentials. No code change
    required — Auth.js's Nodemailer provider doesn't care which SMTP
    server it talks to.</p>
    <p>Resend signup: <a href="https://resend.com">resend.com</a> — Pro
    plan is $20/mo for 50K emails.</p>
    <p style="color:#666;font-size:11px">— holymog email-volume cron</p>
  `;
  const text = [
    'holymog email volume report:',
    `Yesterday: ${d1}`,
    `2 days ago: ${d2}`,
    `3 days ago: ${d3}`,
    '',
    force
      ? 'Forced test send.'
      : `All three days crossed ${THRESHOLD}/day. Swap to Resend before Gmail's 2,000/day cap bites.`,
  ].join('\n');

  const sent = await sendEmail({
    to: ALERT_RECIPIENT,
    subject,
    html,
    text,
    tags: [{ name: 'Holymog-Type', value: 'email-volume-alert' }],
  });

  if (!sent.ok) {
    return NextResponse.json(
      {
        ok: false,
        alerted: false,
        error: sent.error,
        counts,
        threshold: THRESHOLD,
      },
      { status: 500 },
    );
  }

  if (!force) await markAlerted();

  return NextResponse.json({
    ok: true,
    alerted: true,
    forced: force,
    counts,
    threshold: THRESHOLD,
  });
}
