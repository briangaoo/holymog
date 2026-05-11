'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * F tier badge — "subhuman". Deeper red gradient, more saturated than
 * ugly-af. Brick → crimson → black.
 */
export default function BadgeSubhuman({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 55%, #3f0a0a 100%)',
        border: 'rgba(239,68,68,0.75)',
        glow: 'rgba(220,38,38,0.40)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #fee2e2 0%, #fca5a5 100%)',
        )}
      >
        subhuman
      </span>
    </span>
  );
}
