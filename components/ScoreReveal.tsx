'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { FinalScores } from '@/types';
import { getTier } from '@/lib/tier';
import { SubScoreCard } from './SubScoreCard';
import { Confetti } from './Confetti';

const MAIN_COUNT_MS = 2000;
const REVEAL_DURATION_MS = 3000;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Props = {
  scores: FinalScores;
  onRevealDone: () => void;
};

export function ScoreReveal({ scores, onRevealDone }: Props) {
  const tier = getTier(scores.overall);
  const [mainCount, setMainCount] = useState(0);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
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
  }, [scores.overall, onRevealDone]);

  const letterStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textShadow: tier.glow ? '0 0 60px rgba(168,85,247,0.55)' : undefined,
        filter: tier.glow ? 'drop-shadow(0 0 36px rgba(34,211,238,0.45))' : undefined,
      }
    : { color: tier.color };

  return (
    <div className="flex w-full flex-col items-center gap-8" role="status" aria-live="polite">
      <Confetti fire color={tier.color} isGradient={tier.isGradient} />

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
        className="text-center font-sans leading-none"
      >
        <div
          style={{
            fontSize: 'clamp(180px, 56vw, 420px)',
            fontWeight: 900,
            ...letterStyle,
          }}
          aria-label={`Tier ${tier.letter}`}
        >
          {tier.letter}
        </div>
      </motion.div>

      <div
        className="font-mono font-semibold tabular-nums text-white"
        style={{ fontSize: 'clamp(56px, 16vw, 96px)' }}
        aria-label={`Overall score ${scores.overall}`}
      >
        {mainCount}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid w-full grid-cols-2 gap-3"
      >
        <SubScoreCard label="Jawline" finalValue={scores.sub.jawline} startDelayMs={200} start />
        <SubScoreCard label="Eyes" finalValue={scores.sub.eyes} startDelayMs={300} start />
        <SubScoreCard label="Skin" finalValue={scores.sub.skin} startDelayMs={400} start />
        <SubScoreCard
          label="Cheekbones"
          finalValue={scores.sub.cheekbones}
          startDelayMs={500}
          start
        />
      </motion.div>
    </div>
  );
}
