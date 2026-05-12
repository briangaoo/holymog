import { appUrl } from './email';

/**
 * Plain-HTML email templates. Inline styles only — most email clients
 * (especially Gmail web) strip <style> blocks and ignore @font-face,
 * so no stylesheets, no remote fonts. The font stack puts our brand
 * face (Space Grotesk) first with a system-sans fallback; clients that
 * don't have it land in the same family of geometric sans-serifs.
 *
 * No body background colour is set on purpose — the email inherits
 * whatever the client renders by default (white in light mode, dark
 * grey in dark mode). Black-on-light or white-on-dark stays readable
 * everywhere and dodges the "edge-to-edge black card on a white inbox
 * row" look.
 *
 * Each template returns `{ subject, html, text }` so the caller can
 * pass them straight into sendEmail().
 */

// Brand fonts. Space Grotesk for body + headlines, IBM Plex Mono for
// the wordmark + small footer.
const FONT_STACK =
  "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK =
  "'IBM Plex Mono', ui-monospace, Menlo, Monaco, monospace";

// Neutral palette that reads well on either a light or dark client
// background. No hard background fills on cards; we rely on hairline
// borders + the client's own surface colour.
const TEXT_PRIMARY = '#0a0a0a';
const TEXT_SECONDARY = '#525252';
const TEXT_TERTIARY = '#737373';
const HAIRLINE = '#e5e5e5';
const SKY = '#2563eb';
const EMERALD = '#059669';
const ROSE = '#dc2626';

export type EmailOutput = { subject: string; html: string; text: string };

function shell(inner: string): string {
  return /* html */ `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
</head>
<body style="margin:0;padding:0;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${TEXT_PRIMARY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:48px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding-bottom:36px;">
          <span style="font-family:${MONO_STACK};font-size:14px;font-weight:600;letter-spacing:0.06em;color:${TEXT_TERTIARY};">holymog</span>
        </td></tr>
        ${inner}
        <tr><td style="padding-top:32px;">
          <div style="height:1px;background:${HAIRLINE};font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td style="padding-top:16px;">
          <p style="margin:0;font-family:${MONO_STACK};font-size:11px;line-height:1.5;letter-spacing:0.04em;color:${TEXT_TERTIARY};">
            &copy; 2026 holymog &middot; <a href="${appUrl('/account')}" style="color:${TEXT_TERTIARY};text-decoration:underline;">manage preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function textShell(content: string): string {
  return `${content}\n\n--\n© 2026 holymog\nmanage preferences: ${appUrl('/account')}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Weekly digest --------------------------------------------------------

export function weeklyDigestEmail(args: {
  display_name: string;
  battles: number;
  battles_won: number;
  elo_delta: number;
  best_scan: number | null;
  scans_this_week: number;
}): EmailOutput {
  const winRate =
    args.battles > 0 ? Math.round((args.battles_won / args.battles) * 100) : null;
  const eloLabel =
    args.elo_delta === 0
      ? '±0'
      : args.elo_delta > 0
        ? `+${args.elo_delta}`
        : `${args.elo_delta}`;
  const eloColor =
    args.elo_delta > 0 ? EMERALD : args.elo_delta < 0 ? ROSE : TEXT_SECONDARY;

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
        `<tr><td style="padding:14px 0;border-top:1px solid ${HAIRLINE};">
           <span style="font-family:${FONT_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:${TEXT_TERTIARY};">${r.label}</span>
         </td><td align="right" style="padding:14px 0;border-top:1px solid ${HAIRLINE};">
           <span style="font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${r.color ?? TEXT_PRIMARY};">${r.value}</span>
         </td></tr>`,
    )
    .join('');

  const inner = `
    <tr><td style="padding-bottom:12px;">
      <h1 style="margin:0;font-family:${FONT_STACK};font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
        your week on holymog
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
        hey ${escapeHtml(args.display_name)} — quick rundown of how the past week went.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rowsHtml}
      </table>
    </td></tr>
    <tr><td>
      <a href="${appUrl('/scan')}" style="display:inline-block;padding:12px 22px;background:${TEXT_PRIMARY};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;margin-right:8px;">scan again</a>
      <a href="${appUrl('/mog')}" style="display:inline-block;padding:11px 22px;border:1px solid ${HAIRLINE};color:${TEXT_PRIMARY};font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">queue a battle</a>
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
}): EmailOutput {
  const inner = `
    <tr><td style="padding-bottom:12px;">
      <h1 style="margin:0;font-family:${FONT_STACK};font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
        you got mogged
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:28px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
        <strong style="color:${TEXT_PRIMARY};">${escapeHtml(args.by_display_name)}</strong>
        just landed a <strong style="color:${SKY};">${args.new_top_score}</strong>
        and bumped your <strong style="color:${TEXT_PRIMARY};">${args.your_score}</strong> down the board.
      </p>
    </td></tr>
    <tr><td>
      <a href="${appUrl('/scan')}" style="display:inline-block;padding:12px 22px;background:${TEXT_PRIMARY};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">scan back</a>
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

// ---- High-score scan review (admin) ---------------------------------------

export function highScoreReviewEmail(args: {
  userId: string;
  scanId: string;
  overall: number;
  threshold: number;
  imageUrl: string;
  profileUrl: string;
  approveUrl: string;
  declineUrl: string;
}): EmailOutput {
  const inner = `
    <tr><td style="padding-bottom:12px;">
      <h1 style="margin:0;font-family:${FONT_STACK};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
        high-score scan flagged
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
        a scan scored <strong style="color:${TEXT_PRIMARY};">${args.overall}</strong> (≥ ${args.threshold}). review the image and decide whether to keep the leaderboard entry.
      </p>
    </td></tr>

    <tr><td style="padding-bottom:24px;">
      <a href="${args.imageUrl}" style="display:block;text-decoration:none;">
        <img src="${args.imageUrl}" alt="scan preview" width="480" style="display:block;width:100%;max-width:480px;height:auto;border-radius:12px;border:1px solid ${HAIRLINE};" />
      </a>
    </td></tr>

    <tr><td style="padding-bottom:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">user id</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.userId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">scan id</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.scanId}</span>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding-bottom:16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px;">
            <a href="${args.approveUrl}" style="display:inline-block;padding:13px 26px;background:${EMERALD};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">
              ✓ approve
            </a>
          </td>
          <td>
            <a href="${args.declineUrl}" style="display:inline-block;padding:13px 26px;background:${ROSE};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">
              ✗ decline &amp; remove
            </a>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding-bottom:8px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${TEXT_TERTIARY};">
        <strong>decline</strong> removes the user's leaderboard entry + photo and drops their pending submission. <strong>approve</strong> is acknowledgement only — no db write.
      </p>
    </td></tr>

    <tr><td style="padding-top:8px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${TEXT_TERTIARY};">
        <a href="${args.profileUrl}" style="color:${SKY};text-decoration:underline;">view user profile</a>
        &middot;
        <a href="${args.imageUrl}" style="color:${SKY};text-decoration:underline;">open scan image</a>
        (7-day signed link)
      </p>
    </td></tr>
  `;

  const text = `high-score scan flagged for review.

overall: ${args.overall} (≥ ${args.threshold})
user: ${args.userId}
scan: ${args.scanId}

scan image (7d signed): ${args.imageUrl}
user profile: ${args.profileUrl}

approve: ${args.approveUrl}
decline & remove: ${args.declineUrl}`;

  return {
    subject: `holymog · high-score review · ${args.overall}`,
    html: shell(inner),
    text: textShell(text),
  };
}

// ---- Battle report (admin) -------------------------------------------------

const REPORT_REASON_LABELS: Record<string, string> = {
  cheating: 'cheating (deepfake / ai face / celebrity)',
  minor: 'minor in video',
  nudity: 'nudity or sexual content',
  harassment: 'harassment or threats',
  spam: 'spam or impersonation',
  other: 'other',
};

/**
 * Emails the admin when a public-battle opponent files a report. Includes
 * the reported player's peak frame as a 7-day signed URL (when one was
 * captured) plus one-click ban / dismiss action links. Both actions land
 * on `/admin/review/report/[reportId]/[action]` and verify an HMAC tied to
 * (reportId, action, expires).
 */
export function battleReportEmail(args: {
  reportId: string;
  battleId: string;
  reporterUserId: string;
  reporterDisplayName: string;
  reportedUserId: string;
  reportedDisplayName: string;
  reason: string;
  details: string | null;
  imageUrl: string | null;
  banUrl: string;
  dismissUrl: string;
}): EmailOutput {
  const reasonLabel = REPORT_REASON_LABELS[args.reason] ?? args.reason;

  const imageBlock = args.imageUrl
    ? `<tr><td style="padding-bottom:24px;">
         <a href="${args.imageUrl}" style="display:block;text-decoration:none;">
           <img src="${args.imageUrl}" alt="peak frame" width="480" style="display:block;width:100%;max-width:480px;height:auto;border-radius:12px;border:1px solid ${HAIRLINE};" />
         </a>
         <p style="margin:8px 0 0;font-family:${FONT_STACK};font-size:11px;line-height:1.5;color:${TEXT_TERTIARY};">
           reported player&rsquo;s peak frame from this battle &middot; 7-day signed link
         </p>
       </td></tr>`
    : `<tr><td style="padding-bottom:24px;">
         <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
           no peak frame on file for the reported player (their score never beat their starting peak, or the storage write failed). decide on the textual report alone.
         </p>
       </td></tr>`;

  const detailsBlock = args.details
    ? `<tr>
         <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};vertical-align:top;">
           <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">details</span>
         </td>
         <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
           <pre style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${TEXT_PRIMARY};white-space:pre-wrap;">${escapeHtml(args.details)}</pre>
         </td>
       </tr>`
    : '';

  const inner = `
    <tr><td style="padding-bottom:12px;">
      <h1 style="margin:0;font-family:${FONT_STACK};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
        battle report
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
        <strong style="color:${TEXT_PRIMARY};">${escapeHtml(args.reporterDisplayName)}</strong>
        reported
        <strong style="color:${TEXT_PRIMARY};">${escapeHtml(args.reportedDisplayName)}</strong>
        for
        <strong style="color:${ROSE};">${escapeHtml(reasonLabel)}</strong>
        in a public 1v1 battle.
      </p>
    </td></tr>

    ${imageBlock}

    <tr><td style="padding-bottom:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">battle id</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.battleId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">reporter</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.reporterUserId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">reported</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.reportedUserId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${TEXT_TERTIARY};">report id</span>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${HAIRLINE};">
            <span style="font-family:${MONO_STACK};font-size:12px;color:${TEXT_PRIMARY};">${args.reportId}</span>
          </td>
        </tr>
        ${detailsBlock}
      </table>
    </td></tr>

    <tr><td style="padding-bottom:16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px;">
            <a href="${args.banUrl}" style="display:inline-block;padding:13px 26px;background:${ROSE};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">
              ✗ ban &amp; resolve
            </a>
          </td>
          <td>
            <a href="${args.dismissUrl}" style="display:inline-block;padding:13px 26px;background:${EMERALD};color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;border-radius:9999px;">
              ✓ dismiss
            </a>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding-bottom:8px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${TEXT_TERTIARY};">
        <strong>ban</strong> sets the reported player&rsquo;s <code>banned_at</code>, kills every active session, marks the report <code>banned</code>, emails the user, and audit-logs. <strong>dismiss</strong> only marks the report <code>dismissed</code> &mdash; no user impact, no notification.
      </p>
    </td></tr>

    <tr><td style="padding-top:8px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${TEXT_TERTIARY};">
        both links expire in 7 days. re-flag the report from this email and a new pair is issued.
      </p>
    </td></tr>
  `;

  const text = `battle report

${args.reporterDisplayName} reported ${args.reportedDisplayName} for: ${reasonLabel}
battle: ${args.battleId}
reporter: ${args.reporterUserId}
reported: ${args.reportedUserId}
report:   ${args.reportId}

${args.details ? `details:\n${args.details}\n\n` : ''}${
    args.imageUrl ? `peak frame (7d signed): ${args.imageUrl}\n\n` : 'no peak frame on file.\n\n'
  }ban & resolve: ${args.banUrl}
dismiss:       ${args.dismissUrl}`;

  return {
    subject: `holymog · battle report · ${reasonLabel}`,
    html: shell(inner),
    text: textShell(text),
  };
}

// ---- Ban notice (sent to the banned user) ----------------------------------

/**
 * Fires from the admin "Ban" action. The user has just had their
 * `banned_at` set and every session purged — this email tells them
 * what happened and points the appeals path at safety@holymog.com.
 */
export function banNoticeEmail(args: {
  display_name: string;
  reason: string;
}): EmailOutput {
  const reasonLabel = REPORT_REASON_LABELS[args.reason] ?? args.reason;
  const inner = `
    <tr><td style="padding-bottom:12px;">
      <h1 style="margin:0;font-family:${FONT_STACK};font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
        your account was banned
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
        hey ${escapeHtml(args.display_name)} &mdash; a recent battle was flagged and reviewed. we&rsquo;re removing your access to holymog because of:
        <strong style="color:${TEXT_PRIMARY};"> ${escapeHtml(reasonLabel)}</strong>.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
        sign-in is disabled and every active session has been ended. your leaderboard entry, scans, and battle history remain on file in case the decision is reversed.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${TEXT_SECONDARY};">
        if you believe this is a mistake, reply to this email or write to
        <a href="mailto:safety@holymog.com" style="color:${SKY};text-decoration:underline;"> safety@holymog.com</a>
        with the date of the battle and your side of the story. we read every appeal.
      </p>
    </td></tr>
  `;
  const text = `your holymog account was banned.

reason: ${reasonLabel}

sign-in is disabled and every active session has been ended. your data stays on file in case the decision is reversed.

think this is a mistake? reply to this email or write to safety@holymog.com with the date of the battle and your side of the story.`;
  return {
    subject: 'your holymog account was banned',
    html: shell(inner),
    text: textShell(text),
  };
}
