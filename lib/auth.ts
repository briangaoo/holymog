import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Nodemailer from 'next-auth/providers/nodemailer';
import Resend from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import { getPool } from './db';

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

if (useGmailSmtp) {
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
      from: process.env.EMAIL_FROM ?? 'auth@holymog.com',
    }),
  );
} else if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_RESEND_FROM ?? 'auth@holymog.com',
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
