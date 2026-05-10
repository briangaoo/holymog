import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';

/**
 * Smart: reads `weakestSubScore` from userStats and renders it in
 * muted gray brackets after the name. e.g., "briangao (jawline)".
 */
export default function NameCallout({
  children,
  userStats,
}: {
  children: ReactNode;
  userStats?: UserStats;
}) {
  const weakest = userStats?.weakestSubScore;
  if (!weakest) return <>{children}</>;

  return (
    <>
      {children}
      <span style={{ display: 'inline-block', width: '0.35em' }} />
      <span
        style={{
          color: 'rgba(245, 245, 245, 0.45)',
          fontWeight: 400,
          fontSize: '0.85em',
        }}
      >
        ({weakest})
      </span>
    </>
  );
}
