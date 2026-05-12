import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Nodemailer from 'next-auth/providers/nodemailer';
import PostgresAdapter from '@auth/pg-adapter';
import { getPool } from './db';
import { magicLinkEmail } from './auth-email';
import { recordAudit } from './audit';
import { recordEmailSent } from './emailVolume';

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
 *   - Email magic link — Gmail Workspace SMTP via Nodemailer. Sends
 *     from auth@holymog.com (a free Workspace alias of the underlying
 *     hello@holymog.com mailbox) authenticated with a 16-char Google
 *     app password from myaccount.google.com/apppasswords. The
 *     provider only activates when EMAIL_SERVER_PASSWORD is set;
 *     without it, the AuthModal's "email me a link" button still
 *     renders but signIn() returns an error.
 */
const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Lets a signed-in user click "add Google" and have the Google
      // account auto-link to their existing account when the verified
      // emails match. Auth.js calls this "dangerous" because if your
      // OAuth provider hands you an unverified email, an attacker
      // could takeover an existing account; Google always returns
      // email_verified=true so this is safe with Google specifically.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const EMAIL_PROVIDER_ID = 'nodemailer' as const;

// Auth.js Nodemailer provider uses our custom HTML template
// (lib/auth-email.ts) via the sendVerificationRequest hook below.
// Keeping the template in one place means the email looks identical
// across magic-link sign-in, email-change verification, and any other
// future transactional path.
if (process.env.EMAIL_SERVER_PASSWORD) {
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
        void recordEmailSent();
      },
    }),
  );
}

const config: NextAuthConfig = {
  adapter: PostgresAdapter(getPool()),
  // Auth.js sessions are stored in the `sessions` table (database strategy
  // via the adapter). Cookies are host-scoped by default. If AUTH_COOKIE_DOMAIN
  // is set (e.g. ".holymog.com") we override and scope cookies to the parent
  // domain so they're shared between any future subdomains. In dev we let
  // Auth.js use its default localhost cookie.
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
     * Ban gate. The admin "Ban" action on a battle report sets
     * `profiles.banned_at` and purges sessions; this callback stops the
     * banned user from establishing a new session on next sign-in.
     * Returning `false` makes Auth.js redirect to the configured
     * error page (which routes back to `/`).
     *
     * The first-ever sign-in (account creation via the adapter)
     * runs BEFORE the `profiles` row exists. We return `true` in that
     * case so the adapter can finish the insert; subsequent sign-ins
     * see the row and the check kicks in.
     */
    async signIn({ user }) {
      if (!user?.id) return true;
      try {
        const pool = getPool();
        const result = await pool.query<{ banned_at: Date | null }>(
          'select banned_at from profiles where user_id = $1 limit 1',
          [user.id],
        );
        if (result.rows[0]?.banned_at) return false;
      } catch {
        // DB hiccup: fail open. We don't want a Postgres blip to lock
        // every legitimate user out. Bans still take effect on session
        // expiry + manual session purge done at ban time.
      }
      return true;
    },
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
