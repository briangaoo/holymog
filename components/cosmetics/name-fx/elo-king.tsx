import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * Smart: reads `elo` from userStats and appends a small cyan superscript
 * with the current rating after the name.
 */
export default function NameEloKing({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const elo = userStats?.elo;
  if (elo == null) return <>{children}</>;

  return (
    <>
      {children}
      <sup
        style={{
          fontSize: '0.6em',
          color: '#38bdf8',
          marginLeft: '0.15em',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        {elo}
      </sup>
    </>
  );
}
