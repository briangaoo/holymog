'use client';

import { useEffect, useRef } from 'react';
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
 * Top-left live-score card for the scan flow. Visually mirrors the
 * battle-tile ScoreOverlay from app/mog/BattleRoom.tsx so the brand
 * language is consistent — same hard 2px tier-coloured border, same
 * uppercase live pip header, same big number + tier letter row, same
 * thin bar at the bottom. Drops the PLAYER / FLAW rows that the battle
 * version uses (single-player scan, no opponent to mention) and adds
 * a PEAK row that tracks the highest score seen during this scan
 * window — gives the user a sense of "where they've been" not just
 * "where they are right now."
 */
export function LiveScanMeter({ score, visible, error = false }: ScanMeterProps) {
  // Peak resets every time the meter becomes hidden so each scan window
  // starts fresh. Tracked in a ref + state so the re-render on update
  // doesn't trigger a render-loop.
  const peakRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      peakRef.current = null;
      return;
    }
    if (typeof score === 'number') {
      peakRef.current = Math.max(peakRef.current ?? 0, score);
    }
  }, [score, visible]);

  const safeScore = score ?? 50;
  const tier = score !== null ? getTier(safeScore) : null;
  const color = error || score === null ? '#71717a' : getScoreColor(safeScore);
  const peak = peakRef.current;
  const peakColor = peak !== null && !error ? getScoreColor(peak) : '#71717a';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="live-scan-meter"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute z-30 flex w-[180px] flex-col gap-3 bg-black px-3.5 py-3"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 12px) + 12px)',
            left: 'calc(max(env(safe-area-inset-left), 12px) + 12px)',
            border: `2px solid ${color}`,
            borderRadius: 2,
          }}
          aria-hidden
        >
          {/* Header: LIVE SCAN pip */}
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
              LIVE SCAN
            </span>
          </div>

          {/* Score + tier letter */}
          <div className="relative flex items-baseline gap-1.5">
            <span
              className="font-num font-black leading-none tabular-nums"
              style={{
                color,
                fontSize: 44,
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

          {/* Score-as-bar — square, no glow */}
          <div className="relative h-1 w-full bg-white/10">
            <span
              className="absolute left-0 top-0 h-full transition-all duration-500"
              style={{
                width: score !== null && !error ? `${Math.max(0, Math.min(100, score))}%` : '0%',
                background: color,
              }}
            />
          </div>

          {/* PEAK row */}
          <div className="relative flex items-baseline justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">
              PEAK
            </span>
            <span
              className="font-num text-base font-bold tabular-nums"
              style={{ color: peakColor }}
            >
              {peak !== null && !error ? peak : '—'}
            </span>
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
