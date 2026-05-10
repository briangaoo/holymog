'use client';

/**
 * Matchmaking visualization: two profile silhouettes anchored on
 * opposite edges with a slow connecting pulse linking them across
 * the center. Pure SVG + CSS.
 */
const SILHOUETTE_PATH =
  // shoulders + head profile, designed in a 200x300 viewbox
  'M 100 60 ' +
  'C 70 60 60 90 60 110 ' +
  'C 60 135 75 150 100 150 ' +
  'C 125 150 140 135 140 110 ' +
  'C 140 90 130 60 100 60 ' +
  'Z ' +
  'M 100 165 ' +
  'C 60 165 35 195 30 235 ' +
  'L 30 300 ' +
  'L 170 300 ' +
  'L 170 235 ' +
  'C 165 195 140 165 100 165 ' +
  'Z';

export default function ThemeMatchFound() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at 50% 50%, rgba(14,16,24,1) 0%, rgba(4,5,10,1) 75%)',
      }}
    >
      <style>{`
        @keyframes match-pulse-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes match-line-breathe {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.75; }
        }
        @keyframes match-silhouette-fade {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @keyframes match-dash-flow {
          to { stroke-dashoffset: -40; }
        }
        .match-silhouette {
          animation: match-silhouette-fade 5s ease-in-out infinite;
        }
        .match-silhouette.right {
          animation-delay: -2.5s;
        }
        .match-line {
          animation:
            match-line-breathe 5s ease-in-out infinite,
            match-dash-flow 3s linear infinite;
          stroke-dasharray: 6 10;
        }
        .match-traveler {
          offset-path: path('M 0 0 L 1 0');
          animation: match-pulse-travel 5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .match-silhouette,
          .match-line,
          .match-traveler { animation: none; }
          .match-traveler { opacity: 0; }
        }
      `}</style>

      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 50"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left silhouette */}
        <g
          className="match-silhouette"
          transform="translate(2 12) scale(0.10)"
        >
          <path d={SILHOUETTE_PATH} fill="rgba(160, 180, 220, 0.9)" />
        </g>
        {/* Right silhouette (mirrored) */}
        <g
          className="match-silhouette right"
          transform="translate(98 12) scale(-0.10 0.10)"
        >
          <path d={SILHOUETTE_PATH} fill="rgba(220, 180, 160, 0.9)" />
        </g>
        {/* Connecting line */}
        <line
          className="match-line"
          x1="22"
          y1="25"
          x2="78"
          y2="25"
          stroke="rgba(180, 200, 255, 0.65)"
          strokeWidth="0.35"
        />
        {/* Center pulse glow — slow scale on heartbeat */}
        <circle cx="50" cy="25" r="1.2" fill="rgba(200, 220, 255, 0.35)">
          <animate
            attributeName="r"
            values="0.6;2.5;0.6"
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.15;0.55;0.15"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Traveling pulse dot — left → right */}
        <circle r="0.7" fill="rgba(255, 245, 200, 0.95)">
          <animateMotion
            dur="3.5s"
            repeatCount="indefinite"
            path="M 22 25 L 78 25"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.9;1"
            dur="3.5s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Traveling pulse dot — right → left, offset phase */}
        <circle r="0.7" fill="rgba(255, 220, 200, 0.95)">
          <animateMotion
            dur="3.5s"
            begin="1.75s"
            repeatCount="indefinite"
            path="M 78 25 L 22 25"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.9;1"
            dur="3.5s"
            begin="1.75s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}
