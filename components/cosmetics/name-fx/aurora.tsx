import type { ReactNode } from 'react';

export default function NameAurora({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="name-fx-aurora">{children}</span>;
}
