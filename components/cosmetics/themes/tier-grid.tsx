'use client';

import { useId } from 'react';

/**
 * Tier-letter pattern (S+/A/B/C) tiling and slowly cycling tier
 * colours. Renders as an SVG `<pattern>` so it tiles cheaply across
 * any viewport size. The cycle is achieved by overlaying multiple
 * pattern layers (one per tier colour) with opacity keyframes so
 * different tiers fade in/out across a 12-second loop.
 */
const TIERS: { letter: string; color: string }[] = [
  { letter: 'S+', color: 'rgba(245, 200, 60, 0.42)' }, // gold
  { letter: 'A',  color: 'rgba(200, 80, 200, 0.38)' }, // violet
  { letter: 'B',  color: 'rgba(70, 200, 230, 0.38)' }, // cyan
  { letter: 'C',  color: 'rgba(120, 200, 120, 0.36)' }, // green
];

export default function ThemeTierGrid() {
  const id = useId().replace(/:/g, '_');
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{ background: '#06070b' }}
    >
      <style>{`
        @keyframes tier-cycle-0 { 0%, 100% { opacity: 1; } 25% { opacity: 0; } 50% { opacity: 0; } 75% { opacity: 0; } }
        @keyframes tier-cycle-1 { 0%, 100% { opacity: 0; } 25% { opacity: 1; } 50% { opacity: 0; } 75% { opacity: 0; } }
        @keyframes tier-cycle-2 { 0%, 100% { opacity: 0; } 25% { opacity: 0; } 50% { opacity: 1; } 75% { opacity: 0; } }
        @keyframes tier-cycle-3 { 0%, 100% { opacity: 0; } 25% { opacity: 0; } 50% { opacity: 0; } 75% { opacity: 1; } }
        .tier-layer { animation-duration: 16s; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        .tier-layer-0 { animation-name: tier-cycle-0; }
        .tier-layer-1 { animation-name: tier-cycle-1; }
        .tier-layer-2 { animation-name: tier-cycle-2; }
        .tier-layer-3 { animation-name: tier-cycle-3; }
        @media (prefers-reduced-motion: reduce) {
          .tier-layer { animation: none; opacity: 0.5; }
        }
      `}</style>
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {TIERS.map((tier, i) => (
            <pattern
              key={i}
              id={`${id}-tier-${i}`}
              width="120"
              height="120"
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${(i - 1.5) * 4}) translate(${i * 12} ${i * -6})`}
            >
              <text
                x="0"
                y="55"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="800"
                fontSize="48"
                fill={tier.color}
                letterSpacing="4"
              >
                {tier.letter}
              </text>
              <text
                x="60"
                y="110"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="800"
                fontSize="48"
                fill={tier.color}
                letterSpacing="4"
              >
                {tier.letter}
              </text>
            </pattern>
          ))}
        </defs>
        {TIERS.map((_, i) => (
          <rect
            key={i}
            className={`tier-layer tier-layer-${i}`}
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#${id}-tier-${i})`}
          />
        ))}
        {/* Vignette mask via radial gradient overlay */}
        <defs>
          <radialGradient id={`${id}-vignette`} cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.85)" />
          </radialGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${id}-vignette)`}
        />
      </svg>
    </div>
  );
}
