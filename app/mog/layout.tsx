import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'mog',
};

export default function MogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
