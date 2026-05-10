/**
 * Magic-link email template. Minimalist, theme-neutral: no body
 * background colour set so the email inherits the client's default
 * (white on desktop, whatever the user picks in dark-mode clients).
 *
 * Inlined styles only — most email clients (especially Gmail on web)
 * strip <style> blocks and ignore @font-face imports. The font stack
 * tries Space Grotesk (matches the in-app brand) but every reasonable
 * client renders the system-sans fallback, which still lands in the
 * brand's family of geometric sans-serifs.
 *
 * No images: avoids dev-mode broken-image links from localhost and
 * cuts spam-filter noise. The wordmark renders as text in a mono
 * stack so it reads as a stylised label rather than a missing logo.
 */

const FONT_STACK =
  "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK =
  "'IBM Plex Mono', ui-monospace, Menlo, Monaco, monospace";

// Neutral colours that read well on either a white or a dark
// email-client background. The button is the only high-contrast
// element (always black-on-white-or-the-reverse) so the call to
// action stays obvious in either mode.
const TEXT_PRIMARY = '#0a0a0a';
const TEXT_SECONDARY = '#525252';
const TEXT_TERTIARY = '#737373';
const HAIRLINE = '#e5e5e5';

export type MagicLinkEmailInput = {
  /** The signed magic link URL Auth.js generates. */
  url: string;
  /** The recipient email address. */
  recipient: string;
};

export type MagicLinkEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

export function magicLinkEmail({ url }: MagicLinkEmailInput): MagicLinkEmailOutput {
  const subject = 'Sign in to holymog';

  const html = /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${TEXT_PRIMARY};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:48px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
            <!-- Wordmark -->
            <tr>
              <td style="padding-bottom:36px;">
                <span style="font-family:${MONO_STACK};font-size:14px;font-weight:600;letter-spacing:0.06em;color:${TEXT_TERTIARY};">holymog</span>
              </td>
            </tr>

            <!-- Headline -->
            <tr>
              <td style="padding-bottom:12px;">
                <h1 style="margin:0;font-family:${FONT_STACK};font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-0.01em;color:${TEXT_PRIMARY};">
                  Sign in
                </h1>
              </td>
            </tr>

            <!-- Subtext -->
            <tr>
              <td style="padding-bottom:32px;">
                <p style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                  Tap the button below to sign in to your account. This link expires in 24 hours and can only be used once.
                </p>
              </td>
            </tr>

            <!-- Button -->
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${url}"
                   style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#ffffff;font-family:${FONT_STACK};font-size:15px;font-weight:600;text-decoration:none;border-radius:9999px;letter-spacing:-0.005em;">
                  Sign in to holymog
                </a>
              </td>
            </tr>

            <!-- Fallback link -->
            <tr>
              <td style="padding-bottom:40px;">
                <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.55;color:${TEXT_TERTIARY};">
                  Or paste this link into your browser:<br />
                  <a href="${url}" style="color:${TEXT_SECONDARY};word-break:break-all;text-decoration:underline;">${url}</a>
                </p>
              </td>
            </tr>

            <!-- Hairline divider -->
            <tr>
              <td style="padding-bottom:24px;">
                <div style="height:1px;background:${HAIRLINE};font-size:0;line-height:0;">&nbsp;</div>
              </td>
            </tr>

            <!-- Disclaimer -->
            <tr>
              <td style="padding-bottom:8px;">
                <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.55;color:${TEXT_TERTIARY};">
                  If you didn&rsquo;t request this email, you can safely ignore it &mdash; nobody will be signed in unless the link above is opened.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding-top:16px;">
                <p style="margin:0;font-family:${MONO_STACK};font-size:11px;line-height:1.5;letter-spacing:0.04em;color:${TEXT_TERTIARY};">
                  &copy; 2026 holymog
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Sign in to holymog

Tap the link below to sign in. This link expires in 24 hours and can only be used once.

${url}

If you didn't request this email, you can safely ignore it — nobody will be signed in unless the link above is opened.

© 2026 holymog`;

  return { subject, html, text };
}
