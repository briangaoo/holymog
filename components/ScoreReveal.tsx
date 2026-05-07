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
  const tier = getTier(scores.overall);
  const descriptor = getTierDescriptor(tier.letter);
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

  const descriptorColor = tier.isGradient ? '#a855f7' : tier.color;

  return (
    <div className="flex w-full flex-col items-center gap-6" role="status" aria-live="polite">
      <Confetti fire color={tier.color} isGradient={tier.isGradient} />

      <Avatar src={capturedImage} accent={tier.color} isGradient={tier.isGradient} />

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
          className="normal-case"
          style={{
            fontSize: 'clamp(180px, 50vw, 380px)',
            fontWeight: 900,
            ...letterStyle,
          }}
          aria-label={`Tier ${tier.letter}`}
        >
          {tier.letter}
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <div
          className="font-num font-extrabold text-white"
          style={{ fontSize: 'clamp(52px, 14vw, 80px)', lineHeight: 1 }}
          aria-label={`Overall score ${scores.overall}`}
        >
          {mainCount}
        </div>
        <div
          className="text-sm font-medium lowercase tracking-wide"
          style={{ color: descriptorColor, opacity: 0.95 }}
        >
          {descriptor}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid w-full grid-cols-2 gap-3"
      >
        <SubScoreCard label="Jawline" finalValue={scores.sub.jawline} startDelayMs={200} />
        <SubScoreCard label="Eyes" finalValue={scores.sub.eyes} startDelayMs={300} />
        <SubScoreCard label="Skin" finalValue={scores.sub.skin} startDelayMs={400} />
        <SubScoreCard
          label="Cheekbones"
          finalValue={scores.sub.cheekbones}
          startDelayMs={500}
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
