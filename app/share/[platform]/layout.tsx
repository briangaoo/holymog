import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'share',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
