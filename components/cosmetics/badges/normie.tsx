'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * C tier badge — "normie". Amber → yellow → gold gradient. Sits at
 * the brand median tier.
 */
export default function BadgeNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #854d0e 0%, #a16207 50%, #ca8a04 100%)',
        border: 'rgba(234,179,8,0.80)',
        glow: 'rgba(234,179,8,0.42)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)',
        )}
      >
        normie
      </span>
    </span>
  );
}
