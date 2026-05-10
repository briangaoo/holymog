import type { ReactNode } from 'react';

export default function NameFrostedGlass({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="name-fx-frosted-glass">{children}</span>;
}
