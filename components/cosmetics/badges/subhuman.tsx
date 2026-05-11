'use client';

/**
 * F tier badge — "subhuman". Shattered face silhouette on red.
 * Cracked-mirror effect via stroke segments at angles.
 */
export default function BadgeSubhuman({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="subhuman"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="sh-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#sh-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Face oval */}
      <ellipse
        cx="32"
        cy="34"
        rx="14"
        ry="17"
        fill="#fecaca"
        stroke="rgba(127,29,29,0.85)"
        strokeWidth="1"
      />
      {/* Cracks (jagged polyline) */}
      <g
        fill="none"
        stroke="#7f1d1d"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22,22 28,28 26,34 32,38" />
        <polyline points="32,38 38,32 36,26 42,22" />
        <polyline points="32,38 30,46 34,52" />
        <polyline points="26,34 20,38" />
        <polyline points="38,32 44,36" />
      </g>
      {/* Eyes hollow */}
      <circle cx="26" cy="30" r="1.6" fill="#7f1d1d" />
      <circle cx="38" cy="30" r="1.6" fill="#7f1d1d" />
    </svg>
  );
}
