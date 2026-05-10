'use client';

const GOLD = '#d4af37';
const GOLD_LIGHT = '#f4c845';
const DARK = '#0a0a0a';

// regular hexagon centered at (32, 32), flat-top, radius 24
const HEX_POINTS = '32,8 53.7,20 53.7,44 32,56 10.3,44 10.3,20';

export default function BadgeHoneycomb({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <clipPath id="hc-hex">
            <polygon points={HEX_POINTS} />
          </clipPath>
          <linearGradient id="hc-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD_LIGHT} />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
        </defs>
        <polygon points={HEX_POINTS} fill={DARK} />
        {/* rising/falling liquid: a tall rect that animates its y */}
        <g clipPath="url(#hc-hex)">
          <rect x="6" width="52" height="60" fill="url(#hc-liquid)">
            <animate
              attributeName="y"
              values="50; 18; 50"
              keyTimes="0; 0.5; 1"
              dur="5.5s"
              calcMode="spline"
              keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </rect>
          {/* surface highlight that rides on the liquid */}
          <rect x="6" width="52" height="2" fill={GOLD_LIGHT} opacity="0.85">
            <animate
              attributeName="y"
              values="50; 18; 50"
              keyTimes="0; 0.5; 1"
              dur="5.5s"
              calcMode="spline"
              keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </rect>
        </g>
        <polygon points={HEX_POINTS} fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
