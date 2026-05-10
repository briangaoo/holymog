import type { ReactNode } from 'react';

export default function NamePixelsort({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="name-fx-pixelsort">{children}</span>;
}
