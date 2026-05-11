'use client';

import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * `name.streak-flame` — appends "N🔥" after the name when the user
 * has an active streak. Hidden when streak is 0 or unavailable.
 */
export default function NameStreakFlame({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const streak =
    userStats?.currentWinStreak ?? userStats?.currentStreak ?? 0;
  if (!streak || streak < 1) {
    return <>{children}</>;
  }
  return (
    <span style={{ display: 'inline-block' }}>
      {children}
      <span
        style={{
          marginLeft: '0.4em',
          fontWeight: 700,
          fontSize: '0.82em',
          color: '#fb923c',
          textShadow: '0 0 8px rgba(251,146,60,0.5)',
          letterSpacing: '-0.01em',
        }}
      >
        {streak}🔥
      </span>
    </span>
  );
}
