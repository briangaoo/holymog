'use client';

import { pillStyle, textGradient } from './_pill';

/**
 * F- tier badge — "ugly af". Crimson → near-black bg, blood-red text
 * gradient. The "rock-bottom" badge.
 */
export default function BadgeUglyAf({ size }: { size: number }) {
  return (
    <span
      style={pillStyle({
        size,
        background:
          'linear-gradient(135deg, #991b1b 0%, #450a0a 60%, #1c0606 100%)',
        border: 'rgba(239,68,68,0.65)',
        glow: 'rgba(239,68,68,0.30)',
      })}
    >
      <span
        style={textGradient(
          'linear-gradient(180deg, #fee2e2 0%, #fca5a5 70%, #ef4444 100%)',
        )}
      >
        ugly af
      </span>
    </span>
  );
}
