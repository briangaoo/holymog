import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'privacy',
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
