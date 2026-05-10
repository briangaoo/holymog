'use client';

const FACE = '#e5e5e5';
const NEEDLE = '#d4af37';
const DARK = '#0a0a0a';

export default function BadgeCompass({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <circle cx="32" cy="32" r="29" fill={DARK} />
        <circle cx="32" cy="32" r="26" fill="none" stroke={FACE} strokeWidth="1" opacity="0.35" />
        <circle cx="32" cy="32" r="20" fill="none" stroke={FACE} strokeWidth="0.6" opacity="0.2" />
        {/* cardinal tick marks (N E S W) — slightly longer than minors */}
        <line x1="32" y1="6" x2="32" y2="13" stroke={FACE} strokeWidth="1.5" />
        <line x1="58" y1="32" x2="51" y2="32" stroke={FACE} strokeWidth="1.5" />
        <line x1="32" y1="58" x2="32" y2="51" stroke={FACE} strokeWidth="1.5" />
        <line x1="6" y1="32" x2="13" y2="32" stroke={FACE} strokeWidth="1.5" />
        {/* minor ticks */}
        <line x1="50" y1="14" x2="47" y2="17" stroke={FACE} strokeWidth="0.8" opacity="0.55" />
        <line x1="14" y1="14" x2="17" y2="17" stroke={FACE} strokeWidth="0.8" opacity="0.55" />
        <line x1="50" y1="50" x2="47" y2="47" stroke={FACE} strokeWidth="0.8" opacity="0.55" />
        <line x1="14" y1="50" x2="17" y2="47" stroke={FACE} strokeWidth="0.8" opacity="0.55" />
        {/* needle: rhombus pointer rotating slowly + drifting */}
        <g>
          <polygon points="32,12 36.5,32 32,52 27.5,32" fill={NEEDLE} stroke="#a8861f" strokeWidth="0.4" />
          <polygon points="32,12 36.5,32 32,32" fill="#f4c845" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-12 32 32; 14 32 32; -8 32 32; 18 32 32; -12 32 32"
            keyTimes="0; 0.3; 0.55; 0.8; 1"
            dur="9s"
            calcMode="spline"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
            repeatCount="indefinite"
          />
        </g>
        <circle cx="32" cy="32" r="2.2" fill={DARK} stroke={NEEDLE} strokeWidth="0.7" />
      </svg>
    </span>
  );
}
