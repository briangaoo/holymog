'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * F+ tier badge — "chopped". Red → orange → amber gradient. The
 * "burning out" bridge between F and D bands.
 */
export default function BadgeChopped({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #b91c1c 0%, #c2410c 50%, #ea580c 100%)',
        border: 'rgba(249,115,22,0.80)',
        glow: 'rgba(234,88,12,0.45)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #fef3c7 0%, #fed7aa 100%)',
        )}
      >
        chopped
      </span>
    </span>
  );
}
