'use client';

/**
 * D tier badge — "low-tier normie". Flat-line "meh" face on orange.
 */
export default function BadgeLowNormie({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="low-tier normie"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="ln-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ln-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Face circle */}
      <circle
        cx="32"
        cy="32"
        r="18"
        fill="#fed7aa"
        stroke="rgba(127,57,15,0.85)"
        strokeWidth="1.2"
      />
      {/* Eyes — closed half-moons */}
      <path
        d="M22 30 Q25 33 28 30"
        stroke="#7c2d12"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M36 30 Q39 33 42 30"
        stroke="#7c2d12"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* Mouth — flat line */}
      <line
        x1="25"
        y1="40"
        x2="39"
        y2="40"
        stroke="#7c2d12"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
