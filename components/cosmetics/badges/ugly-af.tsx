'use client';

/**
 * F- tier badge — "ugly af". Skull glyph on dark red disc with a
 * subtle inner shadow + a faint red glow on hover. Self-deprecating
 * humor for the bottom of the board.
 */
export default function BadgeUglyAf({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ugly af"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="ua-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
        <filter id="ua-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ua-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Skull */}
      <g fill="#fef2f2" filter="url(#ua-glow)">
        <path d="M32 14c-9.94 0-18 8.06-18 18 0 6.4 3.4 12.0 8.5 15.2v4.8c0 1.66 1.34 3 3 3h13c1.66 0 3-1.34 3-3v-4.8C46.6 44 50 38.4 50 32c0-9.94-8.06-18-18-18z" />
      </g>
      {/* Eyes */}
      <circle cx="25" cy="32" r="4" fill="#0a0a0a" />
      <circle cx="39" cy="32" r="4" fill="#0a0a0a" />
      {/* Nose */}
      <path d="M30 39 L32 43 L34 39 Z" fill="#0a0a0a" />
      {/* Teeth */}
      <rect x="26" y="46" width="2" height="3" fill="#0a0a0a" />
      <rect x="30" y="46" width="2" height="3" fill="#0a0a0a" />
      <rect x="34" y="46" width="2" height="3" fill="#0a0a0a" />
      <rect x="38" y="46" width="2" height="3" fill="#0a0a0a" />
    </svg>
  );
}
