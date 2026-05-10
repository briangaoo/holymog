'use client';

const FACE = '#e5e5e5';
const SPARK = '#ef4444';
const DARK = '#0a0a0a';

// Side-profile path facing right, designed to fit in a 24x40 bbox.
// We render it twice — once normal, once mirrored — to get two facing each other.
const HALF_PROFILE =
  'M 4 4 ' +
  'C 12 2, 22 6, 23 14 ' +
  'L 24 19 ' + // brow
  'L 27 23 ' + // nose tip
  'L 23 25 ' + // under nose
  'L 25 27 ' + // upper lip
  'L 23 29 ' + // lower lip
  'L 23 33 ' + // chin
  'L 20 35 ' +
  'L 17 38 ' + // jaw to neck
  'L 17 44 ' +
  'L 0 44 ' +
  'L 0 4 Z';

export default function BadgeDuelist({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="64" height="64" rx="10" fill={DARK} />
        {/* left fighter, faces right */}
        <g transform="translate(2 10)">
          <path d={HALF_PROFILE} fill={FACE} />
        </g>
        {/* right fighter, faces left (mirrored) */}
        <g transform="translate(62 10) scale(-1 1)">
          <path d={HALF_PROFILE} fill={FACE} />
        </g>
        {/* central spark/clash dot pulsing between them */}
        <g>
          <circle cx="32" cy="32" r="2.5" fill={SPARK}>
            <animate
              attributeName="opacity"
              values="0.4; 1; 0.4"
              dur="1.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="1.8; 3.2; 1.8"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </circle>
          {/* clash flares — tiny crossing lines */}
          <line x1="29" y1="29" x2="35" y2="35" stroke={SPARK} strokeWidth="0.8" opacity="0.7">
            <animate
              attributeName="opacity"
              values="0; 0.85; 0"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </line>
          <line x1="35" y1="29" x2="29" y2="35" stroke={SPARK} strokeWidth="0.8" opacity="0.7">
            <animate
              attributeName="opacity"
              values="0; 0.85; 0"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </line>
        </g>
      </svg>
    </span>
  );
}
