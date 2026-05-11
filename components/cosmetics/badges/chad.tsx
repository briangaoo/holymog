'use client';

/**
 * S- tier badge — "chad". Gradient cyan→purple short crown on
 * dark disc. The first S-tier flex.
 */
export default function BadgeChad({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="chad"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="ch2-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <linearGradient id="ch2-crown" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ch2-bg)" />
      {/* Iridescent border */}
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="url(#ch2-crown)"
        strokeWidth="1.8"
      />
      {/* Inner subtle glow ring */}
      <circle
        cx="32"
        cy="32"
        r="27"
        fill="none"
        stroke="rgba(168,85,247,0.25)"
        strokeWidth="1"
      />
      {/* Crown with 3 peaks */}
      <g>
        <path
          d="M14 40 L20 24 L26 34 L32 20 L38 34 L44 24 L50 40 Z"
          fill="url(#ch2-crown)"
          stroke="#0f172a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <rect
          x="14"
          y="40"
          width="36"
          height="6"
          fill="url(#ch2-crown)"
          stroke="#0f172a"
          strokeWidth="1.2"
        />
        {/* Highlight band on the base */}
        <rect
          x="14"
          y="40"
          width="36"
          height="2"
          fill="rgba(255,255,255,0.35)"
        />
      </g>
      {/* Inner gem */}
      <circle
        cx="32"
        cy="43"
        r="1.8"
        fill="#0a0a0a"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.4"
      />
    </svg>
  );
}
