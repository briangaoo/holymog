import type { ReactNode } from 'react';

export default function NameEmbossedGold({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="name-fx-embossed-gold">{children}</span>;
}
