'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * D tier badge — "low normie". Burnt orange gradient.
 */
export default function BadgeLowNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #9a3412 0%, #c2410c 60%, #ea580c 100%)',
        border: 'rgba(249,115,22,0.75)',
        glow: 'rgba(234,88,12,0.40)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #fff7ed 0%, #fed7aa 100%)',
        )}
      >
        low normie
      </span>
    </span>
  );
}
