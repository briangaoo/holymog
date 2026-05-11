'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * A tier badge — "chadlite". Forest green → emerald gradient. First
 * aspirational tier — the mogging begins.
 */
export default function BadgeChadlite({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
        border: 'rgba(34,197,94,0.85)',
        glow: 'rgba(34,197,94,0.55)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #f0fdf4 0%, #bbf7d0 100%)',
        )}
      >
        chadlite
      </span>
    </span>
  );
}
