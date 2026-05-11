'use client';

/**
 * A tier badge — "chadlite". Flexing arm silhouette on a green disc.
 * Mogging starts here.
 */
export default function BadgeChadlite({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="chadlite"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="cl-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#14532d" />
        </radialGradient>
        <linearGradient id="cl-arm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#cl-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Flexing arm — upper + bicep + forearm */}
      <g fill="url(#cl-arm)" stroke="#052e16" strokeWidth="1.4" strokeLinejoin="round">
        {/* Upper arm (horizontal) */}
        <path d="M14 38 Q14 32 20 32 L32 32 Q34 32 34 34 L34 42 Q34 44 32 44 L20 44 Q14 44 14 38 Z" />
        {/* Bicep peak */}
        <path d="M24 32 Q26 22 34 22 Q42 22 42 30 L42 32 L34 32 Z" />
        {/* Forearm (vertical, fist up) */}
        <path d="M34 32 L34 16 Q34 12 38 12 Q42 12 42 16 L42 32 Z" />
        {/* Fist knuckles */}
        <circle cx="38" cy="14" r="2.4" />
      </g>
      {/* Highlight on bicep */}
      <ellipse
        cx="32"
        cy="27"
        rx="4"
        ry="2"
        fill="rgba(255,255,255,0.45)"
      />
    </svg>
  );
}
