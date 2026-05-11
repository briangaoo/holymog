'use client';

import { pillStyle } from './_pill';

/**
 * F tier badge — "subhuman". Slightly punchier red than ugly-af.
 */
export default function BadgeSubhuman({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        fg: '#fecaca',
        bg: '#991b1b',
        border: 'rgba(239,68,68,0.7)',
        glow: 'rgba(220,38,38,0.28)',
      })}
    >
      subhuman
    </span>
  );
}
