'use client';

const GOLD = '#d4af37';
const BG = '#0a0a0a';

export default function BadgeTarotBack({ size }: { size: number }) {
  // 8 sun rays radiating from sun center
  const sunCx = 32;
  const sunCy = 22;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const x1 = sunCx + Math.cos(a) * 8.5;
    const y1 = sunCy + Math.sin(a) * 8.5;
    const x2 = sunCx + Math.cos(a) * 12.5;
    const y2 = sunCy + Math.sin(a) * 12.5;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" />;
  });

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <mask id="moon-mask-tarot">
            <rect width="64" height="64" fill="black" />
            <circle cx="29" cy="46" r="9" fill="white" />
            <circle cx="33" cy="44" r="8" fill="black" />
          </mask>
        </defs>
        <rect width="64" height="64" rx="12" fill={BG} />
        <rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke={GOLD} strokeWidth="1.2" />
        {/* divider line between sun and moon */}
        <line x1="10" y1="32" x2="54" y2="32" stroke={GOLD} strokeWidth="0.6" opacity="0.55" />
        {/* sun */}
        <circle cx={sunCx} cy={sunCy} r="6" fill={GOLD} />
        {rays}
        {/* crescent moon */}
        <rect width="64" height="64" fill={GOLD} mask="url(#moon-mask-tarot)" />
      </svg>
    </span>
  );
}
