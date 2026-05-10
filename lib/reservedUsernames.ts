/**
 * Usernames that collide with route segments, support emails, or
 * brand-protection slugs. Public-profile URLs live at
 * `/account/[username]`, so any username matching one of these would
 * either route to the wrong page (e.g. `/account/store` already exists
 * as the storefront) or impersonate the brand.
 *
 * Match is case-insensitive — `Admin`, `ADMIN`, and `admin` are all
 * blocked. Maintain alphabetically.
 */
const RESERVED = new Set<string>([
  // Auth + admin
  'admin',
  'administrator',
  'auth',
  'login',
  'logout',
  'root',
  'signin',
  'signout',
  'signup',

  // App routes (must stay in sync with files under app/)
  'account',
  'api',
  'battle',
  'help',
  'leaderboard',
  'mog',
  'privacy',
  'profile',
  'scan',
  'settings',
  'share',
  'shop',
  'store',
  'support',
  'team',
  'terms',
  'webhooks',

  // Brand
  'about',
  'careers',
  'contact',
  'holymog',
  'mail',
  'official',
  'staff',

  // Catch-alls
  'mod',
  'moderator',
  'null',
  'undefined',
  'www',
]);

export function isReservedUsername(name: string): boolean {
  if (!name) return false;
  return RESERVED.has(name.trim().toLowerCase());
}
