import type { NextConfig } from 'next';

/**
 * Always-on security headers. Send on every response regardless of
 * environment. HSTS is safe in dev because browsers ignore it for
 * localhost.
 */
const COMMON_HEADERS = [
  // HSTS — force HTTPS for 2 years on every subdomain, eligible for
  // the browser preload list (https://hstspreload.org).
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Block being embedded in iframes anywhere. CSP frame-ancestors below
  // is the modern equivalent; X-Frame-Options is the legacy backstop
  // for browsers that don't enforce frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send a referrer only on same-origin and when crossing to a same-
  // or-more-secure origin. Cross-origin downgrades (https → http) get
  // no Referer header at all.
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Camera + mic locked to first-party (scan + battles).
  // Geolocation off entirely. Sensor APIs locked by default.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(self), geolocation=(), accelerometer=(), gyroscope=()',
  },
];

/**
 * Content Security Policy — production only.
 *
 * Dev gets no CSP because Next's HMR + react-refresh need eval()
 * which any strict CSP would block.
 *
 * Known footgun: `'unsafe-inline'` on `script-src` lets any injected
 * `<script>` execute. The proper fix is per-request nonces via
 * middleware. Tracked in docs/runbooks/incident-response.md under
 * "tighten CSP" — until then, defense-in-depth via X-Frame-Options +
 * SameSite cookies + Origin guard + Auth.js session cookies.
 */
const CSP_PRODUCTION = [
  "default-src 'self'",
  // 'unsafe-inline' for Next's hydration scripts; 'wasm-unsafe-eval'
  // for MediaPipe FaceLandmarker's WASM module on the scan page;
  // accounts.google.com for Google OAuth popup script.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com",
  // Tailwind injects style attributes everywhere; 'unsafe-inline'
  // necessary until we adopt CSS-in-JS with nonce support.
  "style-src 'self' 'unsafe-inline'",
  // OAuth provider photos + Supabase Storage (avatar, banner,
  // leaderboard photo) + camera-capture blob URLs.
  "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://*.googleusercontent.com",
  // Camera capture blob URLs + battle share image render.
  "media-src 'self' blob:",
  // Supabase REST + Realtime (wss), Gemini API, LiveKit (wss + REST).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com wss://*.livekit.cloud https://*.livekit.cloud",
  // Next/font/google fetches woff2 from fonts.gstatic.com.
  "font-src 'self' data: https://fonts.gstatic.com",
  // No frames at all.
  "frame-src 'none'",
  "frame-ancestors 'none'",
  // MediaPipe spawns WebWorkers for face detection.
  "worker-src 'self' blob:",
  // Block plugins.
  "object-src 'none'",
  // Always upgrade insecure subresources.
  'upgrade-insecure-requests',
].join('; ');

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
  async headers() {
    const headers = [...COMMON_HEADERS];
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Content-Security-Policy',
        value: CSP_PRODUCTION,
      });
    }
    return [
      {
        source: '/(.*)',
        headers,
      },
    ];
  },
};

export default nextConfig;
