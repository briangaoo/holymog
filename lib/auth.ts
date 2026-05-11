import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Nodemailer from 'next-auth/providers/nodemailer';
import Resend from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import { getPool } from './db';
import { magicLinkEmail } from './auth-email';
import { recordAudit } from './audit';

const MAX_NAME_LEN = 24;

function deriveDisplayName(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const fromName = (input.name ?? '').trim();
  const fromEmail = (input.email ?? '').split('@')[0] ?? '';
  const raw = fromName || fromEmail || 'player';
  return raw.toLowerCase().slice(0, MAX_NAME_LEN) || 'player';
}

/**
 * Build the Auth.js providers list dynamically based on which env vars
 * are configured. Each provider is opt-in:
 *
 *   - Google OAuth — activates when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
 *     are set. Until then the AuthModal shows a greyed-out button.
 *   - Apple OAuth — activates when AUTH_APPLE_ID + AUTH_APPLE_SECRET are
 *     set. AUTH_APPLE_SECRET is a JWT generated from a .p8 key (rotates
 *     every 6 months); see https://authjs.dev/getting-started/providers/apple
 *     for the JWT-generation script. Until then the AuthModal shows a
 *     greyed-out button.
 *   - Email magic link — Gmail Workspace SMTP via Nodemailer is the
 *     production path (sends from auth@holymog.com using a Google app
 *     password). When EMAIL_SERVER_PASSWORD isn't set (e.g. workspace
 *     access pending), we fall back to Resend.
 *
 * The exported `EMAIL_PROVIDER_ID` tells the AuthModal which provider id
 * to pass to `signIn()` — `nodemailer` when Gmail SMTP is active,
 * `resend` otherwise.
 */
const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
    }),
  );
}

const useGmailSmtp = Boolean(process.env.EMAIL_SERVER_PASSWORD);
export const EMAIL_PROVIDER_ID: 'nodemailer' | 'resend' = useGmailSmtp
  ? 'nodemailer'
  : 'resend';

// Both email providers run the same custom HTML template (lib/auth-email.ts):
//   - Nodemailer (Gmail SMTP) gets a `sendVerificationRequest` that calls
//     a fresh transporter and sends the rendered html/text directly.
//   - Resend gets a `sendVerificationRequest` that POSTs to the Resend
//     REST API with the same payload.
// Keeping the template in one place means the email looks identical
// regardless of which provider is live.
if (useGmailSmtp) {
  const fromAddress = process.env.EMAIL_FROM ?? 'auth@holymog.com';
  providers.push(
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
        secure: Number(process.env.EMAIL_SERVER_PORT ?? 465) === 465,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: fromAddress,
      async sendVerificationRequest({ identifier, url }) {
        const { subject, html, text } = magicLinkEmail({
          url,
          recipient: identifier,
        });
        const nodemailer = await import('nodemailer');
        const transport = nodemailer.createTransport({
          host: process.env.EMAIL_SERVER_HOST ?? 'smtp.gmail.com',
          port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
          secure: Number(process.env.EMAIL_SERVER_PORT ?? 465) === 465,
          auth: {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
          },
        });
        const result = await transport.sendMail({
          to: identifier,
          from: fromAddress,
          subject,
          html,
          text,
        });
        const failed = result.rejected
          .concat(result.pending ?? [])
          .filter(Boolean);
        if (failed.length) {
          throw new Error(`SMTP send failed for ${failed.join(', ')}`);
        }
      },
    }),
  );
} else if (process.env.AUTH_RESEND_KEY) {
  const apiKey = process.env.AUTH_RESEND_KEY;
  const fromAddress = process.env.AUTH_RESEND_FROM ?? 'auth@holymog.com';
  providers.push(
    Resend({
      apiKey,
      from: fromAddress,
      async sendVerificationRequest({ identifier, url }) {
        const { subject, html, text } = magicLinkEmail({
          url,
          recipient: identifier,
        });
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: identifier,
            subject,
            html,
            text,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 200)}`);
        }
      },
    }),
  );
}

const config: NextAuthConfig = {
  adapter: PostgresAdapter(getPool()),
  // Auth.js sessions are stored in the `sessions` table (database strategy
  // via the adapter). Cookies are host-scoped by default. If AUTH_COOKIE_DOMAIN
  // is set (e.g. ".holymog.com" once we flip from holymog.vercel.app to the
  // custom domain split between www.holymog.com and auth.holymog.com), we
  // override and scope cookies to the parent domain so they're shared between
  // subdomains. In dev we let Auth.js use its default localhost cookie.
  session: { strategy: 'database' },
  cookies:
    process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_DOMAIN
      ? {
          sessionToken: {
            name: '__Secure-authjs.session-token',
            options: {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              secure: true,
              domain: process.env.AUTH_COOKIE_DOMAIN,
            },
          },
        }
      : undefined,
  providers,
  pages: {
    // Auth.js's built-in error page is fine; if a sign-in error happens,
    // bounce the user back to / with the error in the query string.
    error: '/',
  },
  events: {
    /**
     * Auto-create a `profiles` row the first time a user signs up. Auth.js's
     * adapter populates `users` for us; this ensures the app-level profile
     * (display name + ELO etc.) exists before any other code reads it.
     */
    async createUser({ user }) {
      if (!user.id) return;
      const displayName = deriveDisplayName({
        name: user.name ?? null,
        email: user.email ?? null,
      });
      const pool = getPool();
      await pool.query(
        `insert into profiles (user_id, display_name)
         values ($1, $2)
         on conflict (user_id) do nothing`,
        [user.id, displayName],
      );
      void recordAudit({
        userId: user.id,
        action: 'account_create',
        metadata: { display_name: displayName },
      });
    },
    async signIn({ user, account }) {
      if (!user?.id) return;
      void recordAudit({
        userId: user.id,
        action: 'signin',
        metadata: { provider: account?.provider ?? 'unknown' },
      });
    },
    async signOut(message) {
      // Auth.js calls this with either { session } or { token } depending
      // on strategy. We use database sessions, so it's { session }.
      const userId =
        'session' in message ? message.session?.userId ?? null : null;
      if (!userId) return;
      void recordAudit({ userId, action: 'signout' });
    },
  },
  callbacks: {
    /**
     * Inject user.id into the session object so client + server can read
     * `session.user.id` without an extra DB roundtrip.
     */
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
