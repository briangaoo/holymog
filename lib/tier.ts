import type { TierInfo } from '@/types';

const RED = '#ef4444';
const ORANGE = '#f97316';
const YELLOW = '#eab308';
const LIME = '#84cc16';
const GREEN = '#22c55e';
const S_GRADIENT = 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)';

type TierRow = {
  letter: string;
  min: number;
  max: number;
  color: string;
  isGradient: boolean;
  glow: boolean;
};

const TIERS: TierRow[] = [
  { letter: 'F-', min: 0, max: 9, color: RED, isGradient: false, glow: false },
  { letter: 'F', min: 10, max: 17, color: RED, isGradient: false, glow: false },
  { letter: 'F+', min: 18, max: 25, color: RED, isGradient: false, glow: false },
  { letter: 'D-', min: 26, max: 30, color: ORANGE, isGradient: false, glow: false },
  { letter: 'D', min: 31, max: 35, color: ORANGE, isGradient: false, glow: false },
  { letter: 'D+', min: 36, max: 40, color: ORANGE, isGradient: false, glow: false },
  { letter: 'C-', min: 41, max: 45, color: YELLOW, isGradient: false, glow: false },
  { letter: 'C', min: 46, max: 50, color: YELLOW, isGradient: false, glow: false },
  { letter: 'C+', min: 51, max: 55, color: YELLOW, isGradient: false, glow: false },
  { letter: 'B-', min: 56, max: 60, color: LIME, isGradient: false, glow: false },
  { letter: 'B', min: 61, max: 65, color: LIME, isGradient: false, glow: false },
  { letter: 'B+', min: 66, max: 70, color: LIME, isGradient: false, glow: false },
  { letter: 'A-', min: 71, max: 76, color: GREEN, isGradient: false, glow: false },
  { letter: 'A', min: 77, max: 81, color: GREEN, isGradient: false, glow: false },
  { letter: 'A+', min: 82, max: 86, color: GREEN, isGradient: false, glow: false },
  { letter: 'S-', min: 87, max: 89, color: S_GRADIENT, isGradient: true, glow: false },
  { letter: 'S', min: 90, max: 93, color: S_GRADIENT, isGradient: true, glow: false },
  { letter: 'S+', min: 94, max: 100, color: S_GRADIENT, isGradient: true, glow: true },
];

export function getTier(score: number): TierInfo {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const row = TIERS.find((t) => clamped >= t.min && clamped <= t.max) ?? TIERS[0];
  return {
    letter: row.letter,
    color: row.color,
    isGradient: row.isGradient,
    glow: row.glow,
  };
}

export const TIER_COLOR_TOKEN = {
  RED,
  ORANGE,
  YELLOW,
  LIME,
  GREEN,
  S_GRADIENT,
} as const;
