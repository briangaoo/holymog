'use client';

import { pillStyle } from './_pill';

/**
 * D tier badge — "low normie". Orange.
 */
export default function BadgeLowNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#fed7aa',
        bg: '#7c2d12',
        border: 'rgba(249,115,22,0.65)',
      })}
    >
      low normie
    </span>
  );
}
