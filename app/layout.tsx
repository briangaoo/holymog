import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const nohemi = localFont({
  variable: '--font-nohemi',
  display: 'swap',
  src: [
    { path: './fonts/nohemi/Nohemi-Thin.woff', weight: '100', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-ExtraLight.woff', weight: '200', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-Light.woff', weight: '300', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-Regular.woff', weight: '400', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-Medium.woff', weight: '500', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-SemiBold.woff', weight: '600', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-Bold.woff', weight: '700', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-ExtraBold.woff', weight: '800', style: 'normal' },
    { path: './fonts/nohemi/Nohemi-Black.woff', weight: '900', style: 'normal' },
  ],
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
      className={`${nohemi.variable} ${plexMono.variable} h-full bg-black`}
    >
      <body className="min-h-full bg-black text-white antialiased">{children}</body>
    </html>
  );
}
