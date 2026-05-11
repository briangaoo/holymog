'use client';

/**
 * C tier badge — "normie". Shrug shoulders on yellow disc.
 */
export default function BadgeNormie({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="normie"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="nm-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#a16207" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#nm-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Head */}
      <circle
        cx="32"
        cy="24"
        r="9"
        fill="#fef3c7"
        stroke="rgba(120,53,15,0.85)"
        strokeWidth="1.2"
      />
      {/* Eyes — neutral dots */}
      <circle cx="29" cy="23" r="1.2" fill="#7c2d12" />
      <circle cx="35" cy="23" r="1.2" fill="#7c2d12" />
      {/* Mouth — neutral flat */}
      <line
        x1="29"
        y1="27"
        x2="35"
        y2="27"
        stroke="#7c2d12"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Shrug arms — both shoulders raised */}
      <g
        stroke="#7c2d12"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      >
        <path d="M20 36 Q16 32 18 28" />
        <path d="M44 36 Q48 32 46 28" />
      </g>
      {/* Body */}
      <path
        d="M22 36 Q26 50 32 50 Q38 50 42 36 Z"
        fill="#fef3c7"
        stroke="rgba(120,53,15,0.85)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
