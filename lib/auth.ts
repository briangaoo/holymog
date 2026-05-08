import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
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

const config: NextAuthConfig = {
  adapter: PostgresAdapter(getPool()),
  // Auth.js sessions are stored in the `sessions` table (database strategy
  // via the adapter). Cookies are scoped to .holymog.com so they're shared
  // between www.holymog.com (the app) and auth.holymog.com (the OAuth
  // callback domain). In dev we let Auth.js use its default localhost cookie.
  session: { strategy: 'database' },
  cookies:
    process.env.NODE_ENV === 'production'
      ? {
          sessionToken: {
            name: '__Secure-authjs.session-token',
            options: {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              secure: true,
              domain: '.holymog.com',
            },
          },
        }
      : undefined,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // "common" tenant accepts personal Microsoft accounts (outlook.com,
      // hotmail.com, live.com, xbox) AND any work/school account.
      issuer: 'https://login.microsoftonline.com/common/v2.0',
    }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_RESEND_FROM ?? 'hello@holymog.com',
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
