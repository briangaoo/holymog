'use client';

/**
 * B tier badge — "high-tier normie". Lime check mark with a small
 * smile face nestled in the V of the check.
 */
export default function BadgeHighNormie({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="high-tier normie"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="hn-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="100%" stopColor="#3f6212" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#hn-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Large check */}
      <path
        d="M16 34 L26 46 L50 18"
        stroke="#1a2e05"
        strokeWidth="6.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 34 L26 46 L50 18"
        stroke="#ecfccb"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
