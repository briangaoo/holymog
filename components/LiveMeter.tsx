'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';

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

type ScanMeterProps = {
  /** Live score from /api/quick-score, 0-100, or null before first call. */
  score: number | null;
  /** Whether the scan or mapping phase is currently active. */
  visible: boolean;
  /** Set when /api/quick-score fails — meter renders "N/A" muted. */
  error?: boolean;
};

/**
 * Top-left live-score slab for the scan flow. Mirrors the substantial
 * left-edge card the BattleRoom uses (`LiveScoreCard` in
 * app/mog/BattleRoom.tsx) so the two surfaces feel like the same
 * product. Brian preferred the battle version's heavier slab over the
 * previous compact pill — a 48px score reads at a glance and the LIVE
 * SCORE pip signals "this number is changing in real time."
 *
 * Differences from BattleRoom.LiveScoreCard, intentional:
 *   - No PEAK row — scan is a single shot, there is no all-time-best
 *     within this flow.
 *   - No PLAYER handle — single-player, the user is themselves.
 *   - No improvement / weakness row — /api/quick-score doesn't return
 *     it during scan; the full /api/score reveal does.
 *
 * Same as battle:
 *   - Solid black background (not glass) so the number is readable
 *     against any camera feed.
 *   - 2px tier-coloured border that shifts hue as the score moves.
 *   - 180px fixed width slab anchored top-3 left-3 of the camera.
 *   - LIVE pip + score-as-bar.
 */
export function LiveScanMeter({ score, visible, error = false }: ScanMeterProps) {
  const safeScore = score ?? 50;
  const tier = score !== null ? getTier(safeScore) : null;
  const color = error || score === null ? '#71717a' : getScoreColor(safeScore);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="live-scan-meter"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute z-30 flex w-[180px] flex-col gap-3 bg-black px-3.5 py-3"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 12px) + 12px)',
            left: 'calc(max(env(safe-area-inset-left), 12px) + 12px)',
            border: `2px solid ${color}`,
            borderRadius: 2,
          }}
          aria-hidden
        >
          {/* LIVE pip row. Same as battle's "LIVE SCORE" header. */}
          <div className="relative flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white">
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                <span
                  className="absolute inset-0 animate-ping rounded-full"
                  style={{ background: `${color}cc` }}
                />
                <span
                  className="relative h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
              </span>
              LIVE SCORE
            </span>
          </div>

          {/* Big score + tier letter. Number is the headline (48px);
              tier letter sits beside it at 20px, same balance as
              BattleRoom's LiveScoreCard. */}
          <div className="relative flex items-baseline gap-1.5">
            <span
              className="font-num font-black leading-none tabular-nums"
              style={{
                color,
                fontSize: 48,
                lineHeight: 0.92,
              }}
            >
              {error ? 'N/A' : score !== null ? score : '—'}
            </span>
            {tier && !error && (
              <span
                className="font-num text-xl font-black uppercase"
                style={tierTextStyleInline(safeScore, tier)}
              >
                {tier.letter}
              </span>
            )}
          </div>

          {/* Score-as-bar — square, no glow, hits the tier colour. */}
          <div className="relative h-1 w-full bg-white/10">
            <span
              className="absolute left-0 top-0 h-full transition-all duration-500"
              style={{
                width:
                  score !== null && !error
                    ? `${Math.max(0, Math.min(100, score))}%`
                    : '0%',
                background: color,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Tier letter styling — S-tier gets the cyan→violet gradient via
 *  background-clip: text; everything else takes the solid tier colour.
 *  Brand-exception colour (the only non-monochrome moment per Brian's
 *  brutalist spec). Mirrors the inline helper used by BattleRoom's
 *  ScoreOverlay so the two surfaces match. */
function tierTextStyleInline(
  score: number,
  tier: ReturnType<typeof getTier>,
): React.CSSProperties {
  if (tier.isGradient) {
    return {
      backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textShadow: '0 0 18px rgba(168,85,247,0.4)',
      textTransform: 'uppercase',
    };
  }
  return {
    color: tier.color,
    textShadow: `0 0 14px ${getScoreColor(score)}66`,
    textTransform: 'uppercase',
  };
}
