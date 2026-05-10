'use client';

const DOT = '#22d3ee';
const DARK = '#0a0a0a';

// Three pulsing dots in a row, cycling a slow morse rhythm.
// Pattern: dot1 -> dot2 -> dot3 -> long pause -> repeat (S in morse: ...)
// Each dot has its own animation begin offset; total cycle = 2.4s.
const CYCLE = 2.4;

export default function BadgeMorse({ size }: { size: number }) {
  const dots = [
    { cx: 16, begin: 0 },
    { cx: 32, begin: 0.4 },
    { cx: 48, begin: 0.8 },
  ];

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="64" height="64" rx="14" fill={DARK} />
        {dots.map((d, i) => (
          <g key={i}>
            {/* dim base */}
            <circle cx={d.cx} cy="32" r="6" fill={DOT} opacity="0.18" />
            {/* pulsing core */}
            <circle cx={d.cx} cy="32" r="5" fill={DOT}>
              <animate
                attributeName="opacity"
                values="0.15; 1; 0.15; 0.15"
                keyTimes="0; 0.08; 0.30; 1"
                dur={`${CYCLE}s`}
                begin={`${d.begin}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values="3.5; 6.5; 3.5; 3.5"
                keyTimes="0; 0.08; 0.30; 1"
                dur={`${CYCLE}s`}
                begin={`${d.begin}s`}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}
      </svg>
    </span>
  );
}
