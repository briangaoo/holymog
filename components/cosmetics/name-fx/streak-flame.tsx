import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * Smart: reads `currentWinStreak` from userStats. When ≥ 1, appends the
 * streak count followed by 🔥 after the name. The digit picks up a
 * subtle warm tint so the flame reads as part of the count, not detached
 * emoji garnish.
 */
export default function NameStreakFlame({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const streak = userStats?.currentWinStreak ?? 0;
  if (streak < 1) return <>{children}</>;

  return (
    <>
      {children}
      <span style={{ display: 'inline-block', width: '0.35em' }} />
      <span
        style={{
          color: '#fb923c',
          fontWeight: 700,
          fontSize: '0.95em',
        }}
      >
        {streak}
        <span style={{ marginLeft: '0.05em' }} aria-hidden>
          🔥
        </span>
      </span>
    </>
  );
}
