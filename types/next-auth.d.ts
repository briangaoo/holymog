import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** When set, the session is operating under admin impersonation —
       *  the value is the real admin's user_id. session.user.id reflects
       *  the TARGET user; this field is the operator. Consumers that
       *  need to attribute actions to the admin (audit, banners, etc.)
       *  should prefer this when present. */
      _impersonator_id?: string;
    };
  }
}
