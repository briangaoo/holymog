'use client';

import { pillStyle } from './_pill';

/**
 * C tier badge — "normie". Amber/yellow.
 */
export default function BadgeNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#fef3c7',
        bg: '#854d0e',
        border: 'rgba(234,179,8,0.7)',
        glow: 'rgba(234,179,8,0.28)',
      })}
    >
      normie
    </span>
  );
}
