'use client';

/**
 * Infinite perspective grid receding into a vanishing point. Pure SVG
 * with a CSS animation that scales the grid up — the visual cue of
 * forward motion. Single accent color (cyan-violet).
 *
 * Two interleaved grid layers animate out of phase so when one scales
 * past the viewport the other is already taking its place — gives a
 * continuous infinite-tunnel feel without a hard reset flash.
 */
export default function ThemeCorridor() {
  const accent = 'rgba(120, 170, 255, 0.55)';
  const accentFaint = 'rgba(120, 170, 255, 0.18)';
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at 50% 55%, rgba(15,20,35,1) 0%, rgba(4,5,10,1) 70%)',
      }}
    >
      <style>{`
        @keyframes corridor-recede {
          0%   { transform: translate(-50%, -50%) scale(0.04); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(8); opacity: 0; }
        }
        .corridor-grid {
          position: absolute;
          left: 50%;
          top: 55%;
          width: 200vw;
          height: 200vh;
          transform-origin: center;
          will-change: transform, opacity;
        }
        .corridor-grid.a {
          animation: corridor-recede 7s linear infinite;
        }
        .corridor-grid.b {
          animation: corridor-recede 7s linear infinite;
          animation-delay: -3.5s;
        }
        @media (prefers-reduced-motion: reduce) {
          .corridor-grid.a, .corridor-grid.b {
            animation: none;
            opacity: 0.45;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>

      {/* Centered horizon-glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '55%',
          width: '320px',
          height: '320px',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${accent} 0%, rgba(0,0,0,0) 70%)`,
          filter: 'blur(8px)',
          opacity: 0.45,
        }}
      />

      {/* Two grid layers animating out of phase */}
      {(['a', 'b'] as const).map((variant) => (
        <svg
          key={variant}
          className={`corridor-grid ${variant}`}
          viewBox="-50 -50 100 100"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Concentric squares = perspective recession bands */}
          {Array.from({ length: 8 }, (_, i) => {
            const r = (i + 1) * 6;
            return (
              <rect
                key={i}
                x={-r}
                y={-r}
                width={r * 2}
                height={r * 2}
                fill="none"
                stroke={i % 2 === 0 ? accent : accentFaint}
                strokeWidth={0.25}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {/* Diagonals from corners to vanishing point */}
          {[
            [-50, -50],
            [50, -50],
            [50, 50],
            [-50, 50],
          ].map(([x, y], i) => (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={x}
              y2={y}
              stroke={accentFaint}
              strokeWidth={0.25}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ))}
    </div>
  );
}
