'use client';

const ICE = '#bae6fd';
const ICE_BRIGHT = '#e0f7ff';
const DARK = '#0a0a0a';

const CYCLE = 7.2; // seconds — full snowflake redraw cycle
const ARMS = 6;

// One arm = a stem with two angled side branches near its tip.
// Arms are drawn as a single path so we can stroke-dasharray-animate them.
function armPath(): string {
  // arm extends from origin outward along +y in arm-local frame
  // stem from (0,4) -> (0,28), then two diagonal branches at y=20
  return [
    'M 0 4',
    'L 0 28',
    'M 0 20',
    'L -6 26',
    'M 0 20',
    'L 6 26',
    'M 0 12',
    'L -4 16',
    'M 0 12',
    'L 4 16',
  ].join(' ');
}

export default function BadgeFractal({ size }: { size: number }) {
  const armLen = 60; // generous so dasharray cleanly hides initially

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="64" height="64" rx="10" fill={DARK} />
        <g transform="translate(32 32)">
          {Array.from({ length: ARMS }, (_, i) => {
            const begin = (CYCLE * i) / ARMS;
            return (
              <g key={i} transform={`rotate(${(360 / ARMS) * i})`}>
                <path
                  d={armPath()}
                  stroke={ICE}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={armLen}
                  strokeDashoffset={armLen}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values={`${armLen}; 0; 0; ${armLen}`}
                    keyTimes="0; 0.45; 0.85; 1"
                    dur={`${CYCLE}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            );
          })}
          <circle cx="0" cy="0" r="2" fill={ICE_BRIGHT} />
        </g>
      </svg>
    </span>
  );
}
