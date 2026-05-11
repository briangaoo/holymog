'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * B tier badge — "high normie". Lime → green gradient. First
 * "actually decent" tier.
 */
export default function BadgeHighNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #365314 0%, #4d7c0f 50%, #65a30d 100%)',
        border: 'rgba(132,204,22,0.80)',
        glow: 'rgba(132,204,22,0.45)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #f7fee7 0%, #ecfccb 100%)',
        )}
      >
        high normie
      </span>
    </span>
  );
}
