import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * Smart: reads `bestScanOverall` from userStats and floats it above the
 * name in tiny gold digits. Uses absolute positioning relative to the
 * NameFx wrapper (which is already position: relative); the column is
 * centred horizontally with a fixed -1.05em offset above the baseline.
 */
export default function NameScoreOverlay({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const score = userStats?.bestScanOverall;
  if (score == null) return <>{children}</>;

  return (
    <>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: '-1.05em',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.55em',
          fontWeight: 700,
          color: '#d4af37',
          letterSpacing: '0.04em',
          lineHeight: 1,
          textShadow: '0 0 4px rgba(212, 175, 55, 0.55)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {Math.round(score)}
      </span>
      {children}
    </>
  );
}
