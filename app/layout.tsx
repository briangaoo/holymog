import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

// PolySans (Pangram Pangram) — brand display + body. Self-hosted from
// app/fonts/ via next/font/local. Four weights, all upright; no italics
// shipped in the licensed bundle. Slim 300 / Neutral 400 / Median 500 /
// Bulky 700 covers everything from caption to display-size headlines.
const polySans = localFont({
  src: [
    {
      path: './fonts/PolySans-Slim.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './fonts/PolySans-Neutral.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/PolySans-Median.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/PolySans-Bulky.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-polysans',
  display: 'swap',
});

// IBM Plex Mono — numerics + tabular figures. Kept from the previous
// stack because it pairs cleanly with PolySans and tabular-nums
// rendering is hard to match in a non-mono font.
const plexMono = IBM_Plex_Mono({
  variable: '--font-mono-numeric',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Title template: child routes set `title: 'scan'` and we render
  // "holymog - scan" (regular ASCII hyphen, not en/em dash). The
  // homepage doesn't override, so it falls through to the `default`
  // and renders bare "holymog".
  title: {
    template: 'holymog - %s',
    default: 'holymog',
  },
  description: 'AI-powered face rating. Are you mogging or getting mogged?',
  metadataBase: new URL('https://holymog.com'),
  openGraph: {
    title: 'holymog',
    description: 'AI-powered face rating. F- to S+ tier.',
    url: 'https://holymog.com',
    siteName: 'holymog',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'holymog · ai face-rating game',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'holymog',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'holymog · ai face-rating game',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${polySans.variable} ${plexMono.variable} h-full bg-black`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-black text-white antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
