import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'help',
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
