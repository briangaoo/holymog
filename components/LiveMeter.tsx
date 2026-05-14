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
 * Top-left live-score card for the scan flow. Compact horizontal pill:
 * pulsing tier-colour dot on the left, tier letter + score number to
 * the right, thin score-bar at the bottom. Tier letter and number are
 * the same scale so neither one dwarfs the other (the previous version
 * had a 44px number next to a 20px letter, which read as unbalanced
 * against the camera feed). No PEAK row, no "LIVE SCAN" label — the
 * pulsing dot alone signals 'live' and the tier letter already gives
 * the user the band they're in.
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
          className="pointer-events-none absolute z-30 flex flex-col gap-2 px-3 py-2.5"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 12px) + 12px)',
            left: 'calc(max(env(safe-area-inset-left), 12px) + 12px)',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(8px) saturate(1.4)',
            border: `2px solid ${color}`,
            borderRadius: 2,
            minWidth: 124,
          }}
          aria-hidden
        >
          {/* Tier letter + score, baseline aligned, same scale. Pulsing
              dot lives inside the row so the whole pill is one visual
              unit instead of a header + body. */}
          <div className="flex items-baseline gap-2">
            <span aria-hidden className="relative inline-flex h-1.5 w-1.5 self-center">
              <span
                className="absolute inset-0 animate-ping rounded-full"
                style={{ background: `${color}cc` }}
              />
              <span
                className="relative h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
            </span>
            {tier && !error ? (
              <span
                className="font-num text-[26px] font-black leading-none uppercase tabular-nums"
                style={tierTextStyleInline(safeScore, tier)}
              >
                {tier.letter}
              </span>
            ) : null}
            <span
              className="font-num ml-auto text-[26px] font-black leading-none tabular-nums"
              style={{ color }}
            >
              {error ? 'N/A' : score !== null ? score : '—'}
            </span>
          </div>

          {/* Score-as-bar — thin, no glow, hits the tier colour. */}
          <div className="relative h-[3px] w-full bg-white/10">
            <span
              className="absolute left-0 top-0 h-full transition-all duration-500"
              style={{
                width: score !== null && !error ? `${Math.max(0, Math.min(100, score))}%` : '0%',
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
