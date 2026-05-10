'use client';

const SCAN = '#22c55e';
const DARK = '#0a0a0a';

const BRACKET_LEN = 10;
const SW = 1.8;

// Each corner is an L-shape. We animate the parent group's translate so the
// brackets slide inward (lock on) and out (release) on a loop.
type CornerProps = { x: number; y: number; rotate: number; tx: number; ty: number };

function Corner({ x, y, rotate, tx, ty }: CornerProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <g>
        {/* L-bracket: vertical leg + horizontal leg */}
        <path
          d={`M 0 ${BRACKET_LEN} L 0 0 L ${BRACKET_LEN} 0`}
          stroke={SCAN}
          strokeWidth={SW}
          strokeLinecap="round"
          fill="none"
        />
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`${tx} ${ty}; 0 0; 0 0; ${tx} ${ty}; ${tx} ${ty}`}
          keyTimes="0; 0.30; 0.70; 0.95; 1"
          dur="3.2s"
          calcMode="spline"
          keySplines="0.4 0 0.2 1; 0.5 0 0.5 1; 0.4 0 0.2 1; 0.5 0 0.5 1"
          repeatCount="indefinite"
        />
      </g>
    </g>
  );
}

export default function BadgeScan1({ size }: { size: number }) {
  // 4 corners around a 64x64 viewBox. Inset pattern when locked: at (8,8),
  // (56,8), (56,56), (8,56). Pre-lock offset moves each outward.
  const D = 8;
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="64" height="64" rx="10" fill={DARK} />
        <Corner x={8} y={8} rotate={0} tx={-D} ty={-D} />
        <Corner x={56} y={8} rotate={90} tx={D} ty={-D} />
        <Corner x={56} y={56} rotate={180} tx={D} ty={D} />
        <Corner x={8} y={56} rotate={270} tx={-D} ty={D} />
        {/* center dot pulses */}
        <circle cx="32" cy="32" r="2.5" fill={SCAN}>
          <animate
            attributeName="opacity"
            values="0.3; 1; 0.3"
            keyTimes="0; 0.5; 1"
            dur="1.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="2; 3.2; 2"
            keyTimes="0; 0.5; 1"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </span>
  );
}
