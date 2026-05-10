'use client';

const PIECE = '#f5f5f5';
const AURA = '#a855f7';
const DARK = '#0a0a0a';

// Stylized chess king silhouette: cross finial on top, crown band,
// bell-shaped body, base. Tuned to read at 22px.
const KING_D =
  // cross
  'M 31 6 L 33 6 L 33 9 L 36 9 L 36 11 L 33 11 L 33 16 L 31 16 L 31 11 L 28 11 L 28 9 L 31 9 Z ' +
  // crown body (bell)
  'M 22 18 L 42 18 L 40 22 L 24 22 Z ' +
  // upper body
  'M 24 22 L 40 22 C 42 30, 42 36, 38 42 L 26 42 C 22 36, 22 30, 24 22 Z ' +
  // base ring
  'M 20 44 L 44 44 L 44 48 L 20 48 Z ' +
  // bottom plinth
  'M 18 50 L 46 50 L 46 56 L 18 56 Z';

export default function BadgeKing({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <radialGradient id="king-aura" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={AURA} stopOpacity="0.55" />
            <stop offset="60%" stopColor={AURA} stopOpacity="0.10" />
            <stop offset="100%" stopColor={AURA} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill={DARK} />
        {/* pulsing aura behind the king */}
        <circle cx="32" cy="32" r="28" fill="url(#king-aura)">
          <animate
            attributeName="opacity"
            values="0.55; 1; 0.55"
            keyTimes="0; 0.5; 1"
            dur="2.6s"
            repeatCount="indefinite"
          />
        </circle>
        <path d={KING_D} fill={PIECE} fillRule="evenodd" />
      </svg>
    </span>
  );
}
