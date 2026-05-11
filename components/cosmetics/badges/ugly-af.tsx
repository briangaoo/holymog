'use client';

import { pillStyle } from './_pill';

/**
 * F- tier badge — "ugly af". Deep red pill, the most muted of the F band.
 */
export default function BadgeUglyAf({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#fee2e2',
        bg: '#7f1d1d',
        border: 'rgba(239,68,68,0.55)',
      })}
    >
      ugly af
    </span>
  );
}
