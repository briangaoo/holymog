import type { Metadata, Viewport } from 'next';
import { DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

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
  title: 'Mogem — rate yourself F- to S+',
  description: 'AI-powered face rating. Are you mogging or getting mogged?',
  metadataBase: new URL('https://mogem.vercel.app'),
  openGraph: {
    title: 'Mogem',
    description: 'AI-powered face rating. F- to S+ tier.',
    url: 'https://mogem.vercel.app',
    siteName: 'Mogem',
    images: ['/og.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mogem',
    images: ['/og.svg'],
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
      className={`${dmSans.variable} ${plexMono.variable} h-full bg-black`}
    >
      <body className="min-h-full bg-black text-white antialiased">{children}</body>
    </html>
  );
}
