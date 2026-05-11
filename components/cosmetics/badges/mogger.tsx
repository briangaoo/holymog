'use client';

import { pillStyle } from './_pill';

/**
 * A+ tier badge — "mogger". Brighter green, bolder weight, stronger
 * outer glow — last stop before the S band.
 */
export default function BadgeMogger({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#d1fae5',
        bg: '#166534',
        border: 'rgba(34,197,94,0.9)',
        glow: 'rgba(34,197,94,0.55)',
        weight: 900,
        letterSpacing: '0.08em',
      })}
    >
      mogger
    </span>
  );
}
