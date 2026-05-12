'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';

type Props = {
  score: number | null;
  visible: boolean;
  /** Number of live calls completed so far (0-total). */
  progress?: number;
  total?: number;
  /** True when live-score calls are failing (e.g. Gemini 429 / budget
   *  cap). Pill renders "N/A" in muted zinc instead of a tier letter
   *  so the user doesn't read a placeholder as a real score. */
  error?: boolean;
};

/** Discrete dots representing live-call progress. 5 segments is the
 *  granularity that reads as "scan progress" without feeling busy. */
const PROGRESS_DOTS = 5;

/**
 * Top-center live-scan pill (Dynamic-Island-style). Glassy capsule that
 * shrinks to fit its content: tier letter + middle dot + progress dots.
 * The ambient page-edge aura (LivePageBorder) is the primary score
 * indicator; this pill exists to surface the letter grade and the
 * call-count progress without competing visually.
 */
export function LiveMeter({
  score,
  visible,
  progress = 0,
  total = 10,
  error = false,
}: Props) {
  // Show the pill when there's data to display OR when we want to
  // surface an error state. Without `|| error`, an early failure
  // (e.g. Gemini 429 on the very first call) would just keep the
  // pill hidden, which is indistinguishable from "still loading."
  const showCard = visible && (score !== null || error);
  const safeScore = score ?? 50;
  const tier = getTier(safeScore);
  // In error state, override the tier colour with a muted zinc so
  // nothing reads as a real score.
  const ZINC_500 = '#71717a';
  const color = error ? ZINC_500 : getScoreColor(safeScore);
  // Map progress to PROGRESS_DOTS using round() so the first dot
  // fills at progress=1 (immediate feedback on first call) rather
  // than waiting until progress >= 2.
  const filledDots = error
    ? 0
    : Math.round(Math.max(0, Math.min(1, progress / total)) * PROGRESS_DOTS);

  return (
    <AnimatePresence>
      {showCard && (
        <motion.div
          key="live-meter"
          initial={{ opacity: 0, y: -8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 0px) + 64px)',
          }}
          aria-hidden
        >
          <div
            className="relative flex items-center gap-2.5 rounded-full px-3.5 py-1.5"
            style={{
              background: 'rgba(0,0,0,0.42)',
              backdropFilter: 'blur(20px) saturate(1.6) brightness(0.92)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.6) brightness(0.92)',
              boxShadow: `
                0 8px 28px rgba(0,0,0,0.45),
                0 0 0 0.5px rgba(255,255,255,0.18),
                0 0 0 1.5px ${color}22,
                0 0 22px ${color}33,
                inset 0 1px 0 rgba(255,255,255,0.18)
              `,
            }}
          >
            <span
              className="font-num text-[13px] font-bold uppercase leading-none tabular-nums"
              style={{
                color,
                letterSpacing: '-0.01em',
                textShadow: `0 0 14px ${color}aa, 0 1px 2px rgba(0,0,0,0.6)`,
              }}
            >
              {error ? 'N/A' : tier.letter}
            </span>
            <span className="text-[10px] leading-none text-white/35">·</span>
            <div className="flex items-center gap-[5px]">
              {Array.from({ length: PROGRESS_DOTS }).map((_, i) => {
                const isFilled = i < filledDots;
                return (
                  <span
                    key={i}
                    className="block h-[5px] w-[5px] rounded-full transition-[background-color,box-shadow] duration-300"
                    style={{
                      backgroundColor: isFilled
                        ? color
                        : 'rgba(255,255,255,0.18)',
                      boxShadow: isFilled ? `0 0 8px ${color}aa` : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type BorderProps = {
  color: string | null;
};

/**
 * Tier-coloured viewport rim that breathes. Four layered linear-gradient
 * backgrounds (top / bottom / left / right) on a single fullscreen
 * overlay. Each gradient starts at the configured tier-colour-with-alpha
 * AT the screen edge and fades linearly to transparent over --aura-band
 * pixels. Linear (not gaussian) so the edge pixel actually hits the
 * configured alpha — at peak that's 100%. The @property-registered
 * --aura-band and --aura-alpha vars animate via the live-aura-breathe
 * keyframe in globals.css so the rim pulses width + intensity together.
 * Corners get double-intensity where the top band overlaps with the
 * left/right bands — reads as natural light pooling at the corners.
 */
export function LivePageBorder({ color }: BorderProps) {
  const visible = color !== null;
  const ring = color ?? 'transparent';
  const c = `color-mix(in srgb, ${ring} var(--aura-alpha), transparent)`;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        backgroundImage: visible
          ? [
              `linear-gradient(to bottom, ${c}, transparent)`,
              `linear-gradient(to top, ${c}, transparent)`,
              `linear-gradient(to right, ${c}, transparent)`,
              `linear-gradient(to left, ${c}, transparent)`,
            ].join(', ')
          : 'none',
        backgroundPosition: 'top, bottom, left, right',
        backgroundRepeat: 'no-repeat',
        backgroundSize: visible
          ? `100% var(--aura-band), 100% var(--aura-band), var(--aura-band) 100%, var(--aura-band) 100%`
          : 'auto',
        animation: visible ? 'live-aura-breathe 3.5s ease-in-out infinite' : 'none',
      }}
    />
  );
}
