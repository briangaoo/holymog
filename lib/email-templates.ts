import { appUrl } from './email';

/**
 * Plain-HTML email templates. Kept minimal so they render reliably
 * across every client (Outlook included). Inline styles only — no
 * stylesheets, no images outside of avatars/og graphics.
 *
 * Each template returns `{ subject, html, text }` so the caller can
 * pass them straight into sendEmail(). Text variants are auto-derived
 * fallbacks for clients that block HTML.
 */

const COLORS = {
  bg: '#000000',
  card: '#0a0a0a',
  border: '#1f1f1f',
  text: '#ffffff',
  muted: '#a1a1aa',
  zinc: '#71717a',
  sky: '#38bdf8',
  emerald: '#10b981',
  rose: '#f43f5e',
} as const;

function shell(inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${COLORS.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid ${COLORS.border};">
          <span style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:${COLORS.text};">holymog</span>
        </td></tr>
        ${inner}
      </table>
      <p style="color:${COLORS.zinc};font-size:11px;line-height:1.6;margin:16px 0 0;text-align:center;max-width:520px;">
        you're getting this because you opted in to emails on holymog. <a href="${appUrl('/account')}" style="color:${COLORS.muted};">manage preferences</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function textShell(content: string): string {
  return `${content}\n\n--\nyou're getting this because you opted in to emails on holymog.\nmanage preferences: ${appUrl('/account')}`;
}

// ---- Weekly digest --------------------------------------------------------

export function weeklyDigestEmail(args: {
  display_name: string;
  battles: number;
  battles_won: number;
  elo_delta: number;
  best_scan: number | null;
  scans_this_week: number;
}): { subject: string; html: string; text: string } {
  const winRate =
    args.battles > 0 ? Math.round((args.battles_won / args.battles) * 100) : null;
  const eloLabel =
    args.elo_delta === 0
      ? '±0'
      : args.elo_delta > 0
        ? `+${args.elo_delta}`
        : `${args.elo_delta}`;
  const eloColor =
    args.elo_delta > 0 ? COLORS.emerald : args.elo_delta < 0 ? COLORS.rose : COLORS.muted;

  const rows = [
    {
      label: 'battles',
      value: `${args.battles}${winRate !== null ? `  ·  ${winRate}% win` : ''}`,
    },
    { label: 'elo this week', value: eloLabel, color: eloColor },
    { label: 'scans', value: String(args.scans_this_week) },
    {
      label: 'best scan',
      value: args.best_scan !== null ? String(args.best_scan) : '—',
    },
  ];

  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 0;border-top:1px solid ${COLORS.border};">
           <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:${COLORS.zinc};">${r.label}</span>
         </td><td align="right" style="padding:10px 0;border-top:1px solid ${COLORS.border};">
           <span style="font-size:14px;font-weight:600;color:${r.color ?? COLORS.text};">${r.value}</span>
         </td></tr>`,
    )
    .join('');

  const inner = `
    <tr><td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${COLORS.text};">your week on holymog</h1>
      <p style="margin:0;color:${COLORS.muted};font-size:14px;">
        hey ${escapeHtml(args.display_name)} — quick rundown of how the past week went.
      </p>
    </td></tr>
    <tr><td style="padding:0 28px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rowsHtml}
      </table>
    </td></tr>
    <tr><td style="padding:0 28px 28px;">
      <a href="${appUrl('/scan')}" style="display:inline-block;background:${COLORS.text};color:#000;font-weight:600;font-size:13px;padding:11px 18px;border-radius:999px;text-decoration:none;margin-right:8px;">scan again</a>
      <a href="${appUrl('/mog')}" style="display:inline-block;border:1px solid ${COLORS.border};color:${COLORS.text};font-weight:600;font-size:13px;padding:10px 18px;border-radius:999px;text-decoration:none;">queue a battle</a>
    </td></tr>
  `;

  const text = `your week on holymog
battles: ${args.battles}${winRate !== null ? ` · ${winRate}% win` : ''}
elo: ${eloLabel}
scans: ${args.scans_this_week}
best scan: ${args.best_scan ?? '—'}

scan again: ${appUrl('/scan')}
queue a battle: ${appUrl('/mog')}`;

  return {
    subject: `your holymog week — ${eloLabel} elo`,
    html: shell(inner),
    text: textShell(text),
  };
}

// ---- You got mogged (leaderboard displaced) -------------------------------

export function youGotMoggedEmail(args: {
  display_name: string;
  by_display_name: string;
  new_top_score: number;
  your_score: number;
}): { subject: string; html: string; text: string } {
  const inner = `
    <tr><td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${COLORS.text};">you got mogged</h1>
      <p style="margin:0;color:${COLORS.muted};font-size:14px;">
        <strong style="color:${COLORS.text};">${escapeHtml(args.by_display_name)}</strong>
        just landed a <strong style="color:${COLORS.sky};">${args.new_top_score}</strong>
        and bumped your <strong style="color:${COLORS.text};">${args.your_score}</strong> down the board.
      </p>
    </td></tr>
    <tr><td style="padding:0 28px 28px;">
      <a href="${appUrl('/scan')}" style="display:inline-block;background:${COLORS.text};color:#000;font-weight:600;font-size:13px;padding:11px 18px;border-radius:999px;text-decoration:none;">scan back</a>
    </td></tr>
  `;
  const text = `you got mogged.

${args.by_display_name} landed a ${args.new_top_score} and bumped your ${args.your_score}.

scan back: ${appUrl('/scan')}`;
  return {
    subject: `you got mogged — by ${args.by_display_name}`,
    html: shell(inner),
    text: textShell(text),
  };
}

// ---- Helpers --------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
