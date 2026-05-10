import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * /@username canonical URL for public profiles.
   *
   * Next.js folder names beginning with `@` collide with parallel-route
   * slot syntax (e.g. `app/@modal`), so we keep the actual route at
   * `app/account/[username]` and rewrite the public-facing /@... URL
   * onto it. The browser address bar shows /@briangao; Next renders
   * /account/briangao under the hood.
   *
   * Reverse direction: /account/[username] still works for backward
   * compatibility with any existing share links — both URLs resolve
   * to the same page component.
   */
  async rewrites() {
    return [
      {
        source: '/@:username',
        destination: '/account/:username',
      },
      {
        source: '/@:username/followers',
        destination: '/account/:username/followers',
      },
      {
        source: '/@:username/following',
        destination: '/account/:username/following',
      },
    ];
  },
};

export default nextConfig;
