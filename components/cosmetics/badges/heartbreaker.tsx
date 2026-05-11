'use client';

/**
 * S tier badge — "heartbreaker". Cyan→purple gradient heart with
 * a hairline crack down the middle and a small sparkle catching
 * light off the upper-left curve.
 */
export default function BadgeHeartbreaker({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="heartbreaker"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="hb-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <linearGradient id="hb-heart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#hb-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="url(#hb-heart)"
        strokeWidth="1.8"
      />
      {/* Heart */}
      <path
        d="M32 50 C 14 38 14 22 24 22 C 28 22 31 25 32 27 C 33 25 36 22 40 22 C 50 22 50 38 32 50 Z"
        fill="url(#hb-heart)"
        stroke="#0f172a"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Crack down the middle — jagged */}
      <polyline
        points="32,22 30,28 34,32 30,38 33,44 32,49"
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="32,22 30,28 34,32 30,38 33,44 32,49"
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sparkle highlight */}
      <circle cx="26" cy="26" r="1.2" fill="rgba(255,255,255,0.75)" />
      <circle cx="26" cy="26" r="2.4" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}
