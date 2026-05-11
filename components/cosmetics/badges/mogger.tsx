'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * A+ tier badge — "mogger". Green → emerald → teal gradient.
 * Brighter, more confident than chadlite — last stop before S band.
 */
export default function BadgeMogger({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #166534 0%, #15803d 40%, #0d9488 100%)',
        border: 'rgba(34,197,94,1)',
        glow: 'rgba(34,197,94,0.65)',
        letterSpacing: '0.06em',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #ecfdf5 0%, #a7f3d0 70%, #67e8f9 100%)',
        )}
      >
        mogger
      </span>
    </span>
  );
}
