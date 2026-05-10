'use client';

import { useMemo, type CSSProperties } from 'react';

/**
 * Particle field of glowing embers rising upward, pyre vibe. Pure CSS
 * particles — each ember is a small absolutely-positioned div with a
 * pre-computed random horizontal position, size, duration, and delay.
 * Layout is computed once on mount; positions are deterministic per
 * mount but vary across renders so it never looks tiled.
 */

const EMBER_COUNT = 48;

type Ember = {
  left: number;       // 0..100 (%)
  size: number;       // px
  duration: number;   // s
  delay: number;      // s (negative to stagger from t=0)
  sway: number;       // px horizontal amplitude
  hueShift: number;   // 0..1 -> blend between gold and orange
};

function buildEmbers(seed: number): Ember[] {
  // Deterministic pseudo-random — same seed = same layout. We can't
  // SSR-randomize without hydration mismatch, so we generate from a
  // simple lcg seeded by `seed`.
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  return Array.from({ length: EMBER_COUNT }, () => {
    const r = rand();
    return {
      left: rand() * 100,
      size: 2 + rand() * 4,
      duration: 6 + rand() * 8,
      delay: -rand() * 14,
      sway: 20 + rand() * 50,
      hueShift: r,
    };
  });
}

export default function ThemeEmbers() {
  // Stable seed across re-renders. Pick a fixed value so SSR == client
  // first paint and no hydration warning fires.
  const embers = useMemo(() => buildEmbers(0xc0d3), []);

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at 50% 110%, rgba(60,20,8,1) 0%, rgba(20,8,4,1) 40%, rgba(4,3,2,1) 80%)',
      }}
    >
      <style>{`
        @keyframes ember-rise {
          0%   { transform: translate(0, 0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translate(var(--sway, 0), -110vh) scale(0.3); opacity: 0; }
        }
        .ember {
          position: absolute;
          bottom: -10px;
          border-radius: 50%;
          filter: blur(0.5px);
          will-change: transform, opacity;
          animation: ember-rise linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ember { animation: none; opacity: 0.35; transform: translateY(-25vh); }
        }
      `}</style>

      {/* Bottom warm glow — the pyre */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '35%',
          background:
            'linear-gradient(to top, rgba(255,120,40,0.18), rgba(0,0,0,0))',
          pointerEvents: 'none',
        }}
      />

      {embers.map((e, i) => {
        const color = `rgba(255, ${Math.round(160 + e.hueShift * 60)}, ${Math.round(40 + e.hueShift * 30)}, 0.95)`;
        const style: CSSProperties & Record<'--sway', string> = {
          left: `${e.left}%`,
          width: `${e.size}px`,
          height: `${e.size}px`,
          background: color,
          boxShadow: `0 0 ${e.size * 3}px ${e.size * 0.6}px ${color}`,
          animationDuration: `${e.duration}s`,
          animationDelay: `${e.delay}s`,
          '--sway': `${e.sway * (i % 2 ? 1 : -1)}px`,
        };
        return <div key={i} className="ember" style={style} />;
      })}
    </div>
  );
}
