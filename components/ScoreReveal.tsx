'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { FinalScores } from '@/types';
import { getTier, getTierDescriptor } from '@/lib/tier';
import { SubScoreCard } from './SubScoreCard';
import { Confetti } from './Confetti';

const MAIN_COUNT_MS = 2000;
const REVEAL_DURATION_MS = 3000;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Props = {
  scores: FinalScores;
  capturedImage: string;
  onRevealDone: () => void;
};

export function ScoreReveal({ scores, capturedImage, onRevealDone }: Props) {
  const fallback = scores.fallback === true;
  // When the vision call fell back, every numeric field is a 50
  // placeholder. Pass the score through getTier anyway so the
  // non-fallback path is unchanged, but the fallback branch below
  // overrides every visual.
  const tier = getTier(scores.overall);
  const descriptor = getTierDescriptor(tier.letter);
  const [mainCount, setMainCount] = useState(0);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    if (fallback) {
      // No count-up when there's no real score to reveal. Still fire
      // the done timer so the flow advances normally.
      const doneTimer = window.setTimeout(onRevealDone, REVEAL_DURATION_MS);
      return () => window.clearTimeout(doneTimer);
    }
    const startTs = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - startTs) / MAIN_COUNT_MS);
      const eased = easeOutCubic(t);
      setMainCount(Math.round(scores.overall * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setMainCount(scores.overall);
    };
    raf = requestAnimationFrame(tick);
    const bounceTimer = window.setTimeout(() => setBounce(true), 3000);
    const doneTimer = window.setTimeout(onRevealDone, REVEAL_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(bounceTimer);
      window.clearTimeout(doneTimer);
    };
  }, [scores.overall, onRevealDone, fallback]);

  // In fallback mode every visual switches to muted zinc — no
  // confetti, no tier-colored glow, no count-up. Just "N/A" + "—".
  const ZINC_500 = '#71717a';
  const avatarAccent = fallback ? ZINC_500 : tier.color;
  const avatarGradient = fallback ? false : tier.isGradient;
  const letterStyle: React.CSSProperties = fallback
    ? { color: ZINC_500, textTransform: 'uppercase' }
    : tier.isGradient
      ? {
          backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          textShadow: tier.glow ? '0 0 60px rgba(255,255,255,0.55)' : undefined,
          filter: tier.glow ? 'drop-shadow(0 0 36px rgba(255,255,255,0.45))' : undefined,
          textTransform: 'uppercase',
        }
      : { color: tier.color, textTransform: 'uppercase' };

  const descriptorColor = fallback
    ? ZINC_500
    : tier.isGradient
      ? '#a855f7'
      : tier.color;

  return (
    <div className="flex w-full flex-col items-center gap-6" role="status" aria-live="polite">
      {!fallback && <Confetti fire color={tier.color} isGradient={tier.isGradient} />}

      <Avatar
        src={capturedImage}
        accent={avatarAccent}
        isGradient={avatarGradient}
      />

      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={
          bounce ? { scale: [1, 1.05, 1], opacity: 1 } : { scale: 1, opacity: 1 }
        }
        transition={
          bounce
            ? { duration: 0.3, times: [0, 0.5, 1] }
            : { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }
        }
        className="font-num text-center leading-none"
      >
        <div
          className="uppercase"
          style={{
            fontSize: 'clamp(180px, 50vw, 380px)',
            fontWeight: 900,
            ...letterStyle,
          }}
          aria-label={fallback ? 'Score unavailable' : `Tier ${tier.letter}`}
        >
          {fallback ? '—' : tier.letter}
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <div
          className="font-num font-extrabold uppercase"
          style={{
            fontSize: 'clamp(52px, 14vw, 80px)',
            lineHeight: 1,
            color: fallback ? ZINC_500 : '#ffffff',
          }}
          aria-label={fallback ? 'Overall score unavailable' : `Overall score ${scores.overall}`}
        >
          {fallback ? 'N/A' : mainCount}
        </div>
        <div
          className="text-sm font-medium lowercase tracking-wide"
          style={{ color: descriptorColor, opacity: 0.95 }}
        >
          {fallback ? 'unavailable' : descriptor}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid w-full grid-cols-2 gap-3"
      >
        <SubScoreCard
          label="Jawline"
          finalValue={scores.sub.jawline}
          startDelayMs={200}
          fallback={fallback}
        />
        <SubScoreCard
          label="Eyes"
          finalValue={scores.sub.eyes}
          startDelayMs={300}
          fallback={fallback}
        />
        <SubScoreCard
          label="Skin"
          finalValue={scores.sub.skin}
          startDelayMs={400}
          fallback={fallback}
        />
        <SubScoreCard
          label="Cheekbones"
          finalValue={scores.sub.cheekbones}
          startDelayMs={500}
          fallback={fallback}
        />
      </motion.div>
    </div>
  );
}

function Avatar({
  src,
  accent,
  isGradient,
}: {
  src: string;
  accent: string;
  isGradient: boolean;
}) {
  const ringStyle: React.CSSProperties = isGradient
    ? {
        background:
          'conic-gradient(from 90deg, #22d3ee, #a855f7, #22d3ee)',
      }
    : { background: accent };
  return (
    <div className="relative h-14 w-14 rounded-full p-[1.5px]" style={ringStyle}>
      <div className="h-full w-full overflow-hidden rounded-full bg-black">
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}
