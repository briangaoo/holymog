'use client';

/**
 * A+ tier badge — "mogger". Small gold crown on emerald disc with
 * a subtle "+1" arrow tag below.
 */
export default function BadgeMogger({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="mogger"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="mg-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#14532d" />
        </radialGradient>
        <linearGradient id="mg-crown" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#mg-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Crown — 3 peaks with jewel center */}
      <g>
        <path
          d="M14 38 L20 22 L26 32 L32 18 L38 32 L44 22 L50 38 Z"
          fill="url(#mg-crown)"
          stroke="#78350f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Base bar */}
        <rect
          x="14"
          y="38"
          width="36"
          height="6"
          fill="url(#mg-crown)"
          stroke="#78350f"
          strokeWidth="1.5"
        />
        {/* Jewels */}
        <circle cx="32" cy="41" r="2" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.5" />
        <circle cx="20" cy="41" r="1.3" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="0.4" />
        <circle cx="44" cy="41" r="1.3" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="0.4" />
      </g>
      {/* "+1" tag */}
      <g transform="translate(40, 48)">
        <rect
          x="-7"
          y="-3"
          width="14"
          height="10"
          rx="2"
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="0.8"
        />
        <text
          x="0"
          y="4.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="9"
          fontWeight="800"
          fill="#7c2d12"
          textAnchor="middle"
        >
          +1
        </text>
      </g>
    </svg>
  );
}
