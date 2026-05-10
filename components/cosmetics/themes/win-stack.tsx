'use client';

import type { UserStats } from '@/lib/customization';

/**
 * SMART theme. Renders a vertical column of tier-colored bars on the
 * right edge of the viewport, one bar per match won (capped at 40).
 * Bars stagger-fade-in from the bottom. When matchesWon is null/0,
 * shows an empty column outline with a subtle hint.
 *
 * Tier-color cycle: 8 colours mapped across the stack so the bars
 * read as a progress ladder.
 */
const TIER_COLORS = [
  'rgba(120, 200, 120, 0.55)', // C
  'rgba(80, 200, 180, 0.55)',  // B
  'rgba(80, 170, 230, 0.55)',  // A
  'rgba(170, 120, 230, 0.60)', // S
  'rgba(230, 170, 120, 0.65)', // S+
  'rgba(245, 200, 60, 0.70)',  // gold
  'rgba(245, 150, 60, 0.75)',  // amber
  'rgba(245, 110, 80, 0.78)',  // coral / divine
];

const MAX_BARS = 40;
const BAR_HEIGHT = 12; // px

export default function ThemeWinStack({
  userStats,
}: {
  userStats?: UserStats;
}) {
  const matchesWon = Math.max(0, userStats?.matchesWon ?? 0);
  const filled = Math.min(matchesWon, MAX_BARS);
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at 80% 50%, rgba(14,16,24,1) 0%, rgba(4,5,10,1) 80%)',
      }}
    >
      <style>{`
        @keyframes win-bar-rise {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        .win-stack-col {
          position: absolute;
          right: 16px;
          bottom: 32px;
          width: 16px;
          display: flex;
          flex-direction: column-reverse;
          gap: 2px;
        }
        .win-bar {
          height: ${BAR_HEIGHT}px;
          width: 100%;
          border-radius: 2px;
          box-shadow: 0 0 12px currentColor;
          color: rgba(255,255,255,0.4);
          animation: win-bar-rise 0.45s ease-out backwards;
        }
        .win-bar.empty {
          background: transparent;
          border: 1px dashed rgba(255,255,255,0.10);
          box-shadow: none;
          animation: none;
        }
        .win-stack-hint {
          position: absolute;
          right: 38px;
          bottom: 32px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          writing-mode: vertical-rl;
          transform: rotate(180deg);
        }
        @media (prefers-reduced-motion: reduce) {
          .win-bar { animation: none; }
        }
      `}</style>

      <div className="win-stack-col">
        {Array.from({ length: MAX_BARS }, (_, i) => {
          const isFilled = i < filled;
          if (!isFilled) {
            return <div key={i} className="win-bar empty" />;
          }
          const colorIndex = Math.min(
            TIER_COLORS.length - 1,
            Math.floor((i / MAX_BARS) * TIER_COLORS.length),
          );
          const bg = TIER_COLORS[colorIndex];
          return (
            <div
              key={i}
              className="win-bar"
              style={{
                background: bg,
                color: bg,
                animationDelay: `${i * 35}ms`,
              }}
            />
          );
        })}
      </div>

      <div className="win-stack-hint">
        {filled === 0 ? 'no wins yet' : `${filled} wins`}
      </div>
    </div>
  );
}
