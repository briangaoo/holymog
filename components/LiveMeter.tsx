'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { getTier, getTierDescriptor } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';

type Props = {
  score: number | null;
  visible: boolean;
  /** Number of live calls completed so far (0-total). */
  progress?: number;
  total?: number;
  /** True when live-score calls are failing (e.g. Gemini 429 / budget
   *  cap). Meter renders "N/A" in muted gray instead of a coloured
   *  number so the user doesn't read a 5.0 placeholder as a real score. */
  error?: boolean;
};

const FILTER_ID = 'lm-liquid-glass';

/**
 * Top-left "live scan" readout. True liquid-glass aesthetic:
 *   • SVG `feDisplacementMap` warps the backdrop (lens refraction)
 *   • backdrop-blur + saturate makes content behind softly diffused
 *   • mostly-transparent surface so the camera shows through
 *   • multi-layer inner highlights for the rim-light glass effect
 *   • tier-coloured ambient glow + drop shadow
 */
export function LiveMeter({
  score,
  visible,
  progress = 0,
  total = 10,
  error = false,
}: Props) {
  // Show the card when there's data to display OR when we want to
  // surface an error state. Without `|| error`, an early failure
  // (e.g. Gemini 429 on the very first call) would just keep the
  // meter hidden, which is indistinguishable from "still loading."
  const showCard = visible && (score !== null || error);
  const safeScore = score ?? 50;
  const tier = getTier(safeScore);
  const descriptor = error
    ? 'unavailable'
    : getTierDescriptor(tier.letter) || 'live';
  // In error state, override the tier colour with a muted zinc so
  // nothing reads as a real score.
  const ZINC_500 = '#71717a';
  const color = error ? ZINC_500 : getScoreColor(safeScore);
  const display = error ? 'N/A' : (safeScore / 10).toFixed(1);
  // Bar reflects the live score (5.0 → 50%, 9.0 → 90%). When errored
  // we drop the bar to 0 so it doesn't read as "halfway there."
  const pct = error ? 0 : Math.max(0, Math.min(1, safeScore / 100));

  return (
    <>
      {/* SVG filter applied to backdrop. Hidden, purely a definition. */}
      <svg
        aria-hidden
        width="0"
        height="0"
        className="pointer-events-none absolute"
        style={{ position: 'absolute', width: 0, height: 0 }}
      >
        <defs>
          <filter
            id={FILTER_ID}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="4"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="1.6" result="softNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softNoise"
              scale="9"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <AnimatePresence>
        {showCard && (
          <motion.div
            key="live-meter"
            initial={{ opacity: 0, x: -8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="pointer-events-none fixed z-40"
            style={{
              top: 'calc(max(env(safe-area-inset-top), 0px) + 28px)',
              left: 'calc(max(env(safe-area-inset-left), 0px) + 28px)',
            }}
            aria-hidden
          >
            <div
              className="relative overflow-hidden rounded-[22px]"
              style={{
                minWidth: 188,
                // Fully clear base + uniform black tint, like Apple Liquid
                // Glass. The flat dark wash gives a consistent darkness
                // across the surface (no top-vs-bottom gray gradient), and
                // the rim-light overlay below handles the highlight.
                background: 'rgba(0,0,0,0.32)',
                // Heavy blur + strong saturation boost so blurred backdrop
                // colour pops through the tint. Brightness < 1 to keep it
                // reading as "dark glass" instead of frosted-white.
                backdropFilter: `url(#${FILTER_ID}) blur(30px) saturate(1.9) brightness(0.92)`,
                WebkitBackdropFilter: 'blur(30px) saturate(1.9) brightness(0.92)',
                boxShadow: `
                  0 20px 60px rgba(0,0,0,0.50),
                  0 4px 16px rgba(0,0,0,0.30),
                  0 0 0 0.5px rgba(255,255,255,0.18),
                  0 0 0 2px ${color}1d,
                  0 0 36px ${color}33,
                  inset 0 1.5px 0 rgba(255,255,255,0.30),
                  inset 0 -1px 0 rgba(0,0,0,0.45),
                  inset 1px 0 0 rgba(255,255,255,0.08),
                  inset -1px 0 0 rgba(0,0,0,0.20)
                `,
              }}
            >
              {/* Top rim-light: bright crescent catching light from above */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[28%]"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 60%, transparent 100%)',
                  mixBlendMode: 'screen',
                }}
              />

              {/* Edge lensing, subtle radial brightening at the top-left
                  corner, mimicking how light bends through curved glass */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(140% 100% at 8% 12%, rgba(255,255,255,0.10) 0%, transparent 38%)',
                  mixBlendMode: 'overlay',
                }}
              />

              {/* Top edge shimmer */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                }}
              />

              <div className="relative px-4 pt-3 pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/80"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                  >
                    live scan
                  </span>
                  <span
                    className="font-num text-[10px] font-medium tabular-nums text-white/65"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                  >
                    {Math.min(progress, total)}/{total}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span
                    className="font-num font-extrabold leading-none tabular-nums"
                    style={{
                      color,
                      fontSize: 40,
                      letterSpacing: '-0.04em',
                      textShadow: `0 0 22px ${color}aa, 0 1px 2px rgba(0,0,0,0.6)`,
                    }}
                  >
                    {display}
                  </span>
                  {!error && (
                    <span
                      className="text-[10px] uppercase tracking-[0.18em] text-white/55"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                    >
                      / 10
                    </span>
                  )}
                </div>

                <div
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold lowercase leading-none"
                  style={{
                    color,
                    textShadow: `0 1px 2px rgba(0,0,0,0.6), 0 0 12px ${color}55`,
                  }}
                >
                  <Star size={10} aria-hidden fill={color} strokeWidth={0} />
                  {descriptor}
                </div>
              </div>

              {/* Score-position bar at the bottom */}
              <div
                aria-hidden
                className="relative h-[3px] w-full"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-[width,background-color] duration-300 ease-out"
                  style={{
                    width: `${pct * 100}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 12px ${color}cc`,
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

type BorderProps = {
  color: string | null;
};

/**
 * Tier-coloured viewport border. Each edge is a band that fades from solid
 * tier-colour at the actual screen edge to fully transparent as it moves
 * INWARD into the screen. No animation, no corner fade, just a clean
 * inset gradient on every side.
 */
export function LivePageBorder({ color }: BorderProps) {
  const visible = color !== null;
  const ring = color ?? 'transparent';
  const THICKNESS = 36; // total band depth (the gradient fades over this distance)

  // CSS gradient angle convention: angle is the direction the gradient
  // *travels*. 0% = solid tier colour, 100% = transparent.
  //   180deg = top → bottom         (top bar:    colour at top edge)
  //     0deg = bottom → top         (bottom bar: colour at bottom edge)
  //    90deg = left → right         (left bar:   colour at left edge)
  //   270deg = right → left         (right bar:  colour at right edge)
  const grad = (deg: number) =>
    visible ? `linear-gradient(${deg}deg, ${ring}, transparent)` : 'transparent';

  const sharedClass =
    'pointer-events-none fixed z-40 transition-opacity duration-300';
  const sharedStyle: React.CSSProperties = { opacity: visible ? 1 : 0 };

  return (
    <>
      <div
        aria-hidden
        className={sharedClass}
        style={{
          ...sharedStyle,
          background: grad(180),
          top: 0,
          left: 0,
          right: 0,
          height: THICKNESS,
        }}
      />
      <div
        aria-hidden
        className={sharedClass}
        style={{
          ...sharedStyle,
          background: grad(0),
          bottom: 0,
          left: 0,
          right: 0,
          height: THICKNESS,
        }}
      />
      <div
        aria-hidden
        className={sharedClass}
        style={{
          ...sharedStyle,
          background: grad(90),
          top: 0,
          bottom: 0,
          left: 0,
          width: THICKNESS,
        }}
      />
      <div
        aria-hidden
        className={sharedClass}
        style={{
          ...sharedStyle,
          background: grad(270),
          top: 0,
          bottom: 0,
          right: 0,
          width: THICKNESS,
        }}
      />
    </>
  );
}
