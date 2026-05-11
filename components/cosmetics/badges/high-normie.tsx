'use client';

import { pillStyle } from './_pill';

/**
 * B tier badge — "high normie". Lime.
 */
export default function BadgeHighNormie({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#ecfccb',
        bg: '#3f6212',
        border: 'rgba(132,204,22,0.7)',
        glow: 'rgba(132,204,22,0.32)',
      })}
    >
      high normie
    </span>
  );
}
