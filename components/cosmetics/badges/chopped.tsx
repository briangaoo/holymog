'use client';

import { pillStyle } from './_pill';

/**
 * F+ tier badge — "chopped". Red-orange — bridge between F and D bands.
 */
export default function BadgeChopped({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#fed7aa',
        bg: '#9a3412',
        border: 'rgba(249,115,22,0.7)',
        glow: 'rgba(234,88,12,0.30)',
      })}
    >
      chopped
    </span>
  );
}
