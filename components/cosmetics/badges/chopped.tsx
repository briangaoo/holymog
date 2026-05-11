'use client';

/**
 * F+ tier badge — "chopped". Cleaver mid-strike on a red-orange
 * disc with a chop motion-blur slash.
 */
export default function BadgeChopped({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="chopped"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="ch-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
        <linearGradient id="ch-blade" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="60%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ch-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="1.5"
      />
      {/* Motion slash */}
      <path
        d="M12 50 L52 14"
        stroke="rgba(255,255,255,0.40)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M16 52 L48 18"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Cleaver blade */}
      <g transform="rotate(-35, 32, 32)">
        <rect
          x="18"
          y="24"
          width="22"
          height="16"
          rx="2"
          fill="url(#ch-blade)"
          stroke="#374151"
          strokeWidth="1"
        />
        {/* Blade edge highlight */}
        <line
          x1="20"
          y1="40"
          x2="38"
          y2="40"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="0.7"
        />
        {/* Handle */}
        <rect
          x="40"
          y="29"
          width="10"
          height="6"
          fill="#78350f"
          stroke="#3f1f08"
          strokeWidth="0.8"
        />
        <line
          x1="42"
          y1="32"
          x2="49"
          y2="32"
          stroke="#fbbf24"
          strokeWidth="0.5"
        />
      </g>
    </svg>
  );
}
