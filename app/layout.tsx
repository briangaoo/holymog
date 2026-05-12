import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
});

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
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${plexMono.variable} h-full bg-black`}
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
