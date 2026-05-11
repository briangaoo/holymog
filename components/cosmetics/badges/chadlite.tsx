'use client';

import { pillStyle } from './_pill';

/**
 * A tier badge — "chadlite". Green. First aspirational tier.
 */
export default function BadgeChadlite({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#bbf7d0',
        bg: '#14532d',
        border: 'rgba(34,197,94,0.75)',
        glow: 'rgba(34,197,94,0.40)',
      })}
    >
      chadlite
    </span>
  );
}
