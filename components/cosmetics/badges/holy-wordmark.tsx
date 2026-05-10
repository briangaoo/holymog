'use client';

import { useId } from 'react';

const GOLD = '#d4af37';
const GOLD_BRIGHT = '#f4c845';
const DARK = '#0a0a0a';

/**
 * Halo-encircled holymog mark. The wordmark itself is unreadable at 22px,
 * so we render a stylised 'h' inside a thin gold halo. The store-size
 * preview (64px) reveals the full wordmark curving along the halo arc.
 */
export default function BadgeHolyWordmark({ size }: { size: number }) {
  const id = useId().replace(/:/g, '');
  const text = 'holymog · holymog · ';

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <path
            id={`${id}-arc`}
            d="M 32 32 m -22 0 a 22 22 0 1 1 44 0 a 22 22 0 1 1 -44 0"
          />
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={GOLD_BRIGHT} />
            <stop offset="50%" stopColor={GOLD} />
            <stop offset="100%" stopColor={GOLD_BRIGHT} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill={DARK} />
        {/* rotating halo + wordmark group */}
        <g style={{ transformOrigin: '32px 32px' }}>
          {/* halo ring */}
          <circle cx="32" cy="32" r="24" fill="none" stroke={`url(#${id}-grad)`} strokeWidth="0.8" opacity="0.6" />
          <circle cx="32" cy="32" r="22" fill="none" stroke={GOLD} strokeWidth="1.4" />
          <circle cx="32" cy="32" r="20" fill="none" stroke={GOLD} strokeWidth="0.4" opacity="0.4" />
          {/* curved wordmark riding the halo */}
          <text
            fill={GOLD}
            fontSize="5.4"
            fontWeight="700"
            letterSpacing="0.4"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
          >
            <textPath href={`#${id}-arc`} startOffset="0">
              {text + text}
            </textPath>
          </text>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 32 32"
            to="360 32 32"
            dur="22s"
            repeatCount="indefinite"
          />
        </g>
        {/* central 'h' stylised brand mark */}
        <g>
          <circle cx="32" cy="32" r="11" fill={DARK} stroke={GOLD} strokeWidth="0.8" opacity="0.85" />
          <text
            x="32"
            y="33"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="14"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            fill={GOLD_BRIGHT}
          >
            h
          </text>
          {/* slow pulse on the mark */}
          <circle cx="32" cy="32" r="11" fill="none" stroke={GOLD_BRIGHT} strokeWidth="0.6">
            <animate
              attributeName="opacity"
              values="0; 0.7; 0"
              keyTimes="0; 0.5; 1"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="11; 14; 11"
              keyTimes="0; 0.5; 1"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </svg>
    </span>
  );
}
