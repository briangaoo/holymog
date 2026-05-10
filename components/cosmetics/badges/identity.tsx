'use client';

const FACE = '#e5e5e5';
const SCAN = '#22d3ee';
const DARK = '#0a0a0a';

// Side-profile face silhouette path. Hand-tuned to read at 22px:
// distinct forehead, nose protrusion, lips, chin, neck.
const PROFILE_D =
  'M 22 12 ' +
  'C 32 8, 44 14, 46 24 ' + // forehead -> brow ridge
  'L 48 30 ' + // brow to nose bridge
  'L 52 35 ' + // nose tip
  'L 47 38 ' + // under nose
  'L 49 41 ' + // upper lip
  'L 47 44 ' + // lower lip
  'L 46 49 ' + // chin
  'L 42 52 ' + // jaw under chin
  'L 38 56 ' + // jaw to neck
  'L 38 64 ' + // neck down off-canvas
  'L 12 64 ' +
  'L 12 12 Z';

export default function BadgeIdentity({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <clipPath id="identity-clip">
            <path d={PROFILE_D} />
          </clipPath>
        </defs>
        <rect width="64" height="64" rx="10" fill={DARK} />
        <path d={PROFILE_D} fill={FACE} />
        {/* horizontal scan line clipped to the face */}
        <g clipPath="url(#identity-clip)">
          <rect x="0" width="64" height="2" fill={SCAN} opacity="0.95">
            <animate
              attributeName="y"
              values="10; 56; 10"
              keyTimes="0; 0.5; 1"
              dur="3.2s"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              repeatCount="indefinite"
            />
          </rect>
          {/* soft glow band trailing the line */}
          <rect x="0" width="64" height="6" fill={SCAN} opacity="0.18">
            <animate
              attributeName="y"
              values="6; 52; 6"
              keyTimes="0; 0.5; 1"
              dur="3.2s"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              repeatCount="indefinite"
            />
          </rect>
        </g>
      </svg>
    </span>
  );
}
