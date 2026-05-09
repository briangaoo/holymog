import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
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
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Magic-link email via Gmail Workspace SMTP. We auth as the underlying
    // mailbox owner (hello@holymog.com) using a Google App Password, and
    // send From: auth@holymog.com (a free alias of the same mailbox set
    // up at the Workspace admin level + in Gmail's "Send mail as"). No
    // extra service / no extra DNS — Workspace already owns the domain.
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
  ],
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
