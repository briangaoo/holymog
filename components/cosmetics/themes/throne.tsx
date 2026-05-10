'use client';

/**
 * Centered crown silhouette with a slow-rotating gold particle ring
 * around it. Pure SVG; the particle ring is 24 small dots arranged
 * on a circle and animated via a rotate transform on a parent <g>.
 */
export default function ThemeThrone() {
  const dots = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at 50% 50%, rgba(18,15,8,1) 0%, rgba(4,3,2,1) 75%)',
      }}
    >
      <style>{`
        @keyframes throne-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes throne-rotate-rev {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes throne-crown-breathe {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @keyframes throne-dot-twinkle {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        .throne-ring { transform-origin: 50% 50%; transform-box: fill-box; }
        .throne-ring-outer {
          animation: throne-rotate 60s linear infinite;
        }
        .throne-ring-inner {
          animation: throne-rotate-rev 80s linear infinite;
        }
        .throne-crown {
          animation: throne-crown-breathe 5s ease-in-out infinite;
        }
        .throne-dot { animation: throne-dot-twinkle 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .throne-ring-outer,
          .throne-ring-inner,
          .throne-crown,
          .throne-dot { animation: none; opacity: 0.6; }
        }
      `}</style>

      <svg
        width="100%"
        height="100%"
        viewBox="-200 -200 400 400"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft gold underglow behind crown */}
        <defs>
          <radialGradient id="throne-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(220, 170, 70, 0.35)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="180" fill="url(#throne-glow)" />

        {/* Outer particle ring */}
        <g className="throne-ring throne-ring-outer">
          {dots.map((i) => {
            const angle = (i / dots.length) * Math.PI * 2;
            const r = 140;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const size = 2 + (i % 3);
            return (
              <circle
                key={i}
                className="throne-dot"
                cx={x}
                cy={y}
                r={size}
                fill="rgba(245, 210, 110, 0.85)"
                style={{ animationDelay: `${(i * 0.15) % 3}s` }}
              />
            );
          })}
        </g>

        {/* Inner particle ring, counter-rotating */}
        <g className="throne-ring throne-ring-inner">
          {dots.slice(0, 16).map((i) => {
            const angle = (i / 16) * Math.PI * 2 + Math.PI / 16;
            const r = 95;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            return (
              <circle
                key={i}
                className="throne-dot"
                cx={x}
                cy={y}
                r={1.5}
                fill="rgba(220, 185, 90, 0.7)"
                style={{ animationDelay: `${(i * 0.18 + 1) % 3}s` }}
              />
            );
          })}
        </g>

        {/* Crown silhouette */}
        <g className="throne-crown" transform="translate(0 6)">
          <path
            // Five-point crown with rounded base
            d="
              M -55 30
              L -55 5
              L -42 -22
              L -28 5
              L -14 -32
              L 0 5
              L 14 -32
              L 28 5
              L 42 -22
              L 55 5
              L 55 30
              C 55 38 50 42 42 42
              L -42 42
              C -50 42 -55 38 -55 30
              Z
            "
            fill="rgba(245, 210, 110, 0.85)"
            stroke="rgba(255, 235, 170, 0.6)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Three central jewel dots */}
          <circle cx="-22" cy="22" r="3.5" fill="rgba(255, 235, 170, 0.95)" />
          <circle cx="0" cy="22" r="4" fill="rgba(255, 245, 195, 1)" />
          <circle cx="22" cy="22" r="3.5" fill="rgba(255, 235, 170, 0.95)" />
        </g>
      </svg>
    </div>
  );
}
