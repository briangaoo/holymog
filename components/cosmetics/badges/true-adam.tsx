'use client';

/**
 * S+ tier badge — "true adam". Tall cyan→purple gradient crown with
 * a halo above + animated sparkle. The peak flex. The crown stays
 * static; the sparkle rotates very slowly so the badge has life at
 * 22px without distracting.
 */
export default function BadgeTrueAdam({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="true adam"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="ta-bg" cx="50%" cy="35%">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <linearGradient id="ta-crown" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id="ta-halo" cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(253,224,71,0.95)" />
          <stop offset="60%" stopColor="rgba(253,224,71,0.30)" />
          <stop offset="100%" stopColor="rgba(253,224,71,0)" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ta-bg)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="url(#ta-crown)"
        strokeWidth="2"
      />
      <circle
        cx="32"
        cy="32"
        r="27"
        fill="none"
        stroke="rgba(168,85,247,0.30)"
        strokeWidth="1"
      />

      {/* Halo above the crown */}
      <ellipse
        cx="32"
        cy="14"
        rx="14"
        ry="3.5"
        fill="url(#ta-halo)"
      />
      <ellipse
        cx="32"
        cy="14"
        rx="11"
        ry="2"
        fill="none"
        stroke="rgba(253,224,71,0.9)"
        strokeWidth="0.8"
      />

      {/* Tall crown */}
      <g>
        <path
          d="M12 46 L18 24 L25 36 L32 18 L39 36 L46 24 L52 46 Z"
          fill="url(#ta-crown)"
          stroke="#0f172a"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <rect
          x="12"
          y="46"
          width="40"
          height="6"
          fill="url(#ta-crown)"
          stroke="#0f172a"
          strokeWidth="1.4"
        />
        {/* Highlight band */}
        <rect
          x="12"
          y="46"
          width="40"
          height="2"
          fill="rgba(255,255,255,0.40)"
        />
        {/* Center gem */}
        <circle cx="32" cy="49" r="2" fill="#fde047" stroke="#7c2d12" strokeWidth="0.5" />
      </g>

      {/* Rotating sparkle group — slow 8s rotation */}
      <g style={{ transformOrigin: '32px 32px', animation: 'ta-spark-rot 8s linear infinite' }}>
        <path
          d="M32 6 L33 12 L39 13 L33 14 L32 20 L31 14 L25 13 L31 12 Z"
          fill="#fef3c7"
          opacity="0.85"
        />
      </g>

      <style>{`
        @keyframes ta-spark-rot {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="ta-spark-rot"] { animation: none !important; }
        }
      `}</style>
    </svg>
  );
}
