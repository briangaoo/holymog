'use client';

import { getTier } from '@/lib/tier';

type Props = { score: number };

export function ShareCard({ score }: Props) {
  const tier = getTier(score);
  const letterStyle: React.CSSProperties = tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textShadow: tier.glow ? '0 0 28px rgba(168,85,247,0.55)' : undefined,
        textTransform: 'uppercase',
      }
    : { color: tier.color, textTransform: 'uppercase' };

  return (
    <div
      aria-hidden
      className="relative flex h-[360px] w-[200px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-black"
      style={{
        backgroundImage: tier.isGradient
          ? 'radial-gradient(circle at 50% 50%, rgba(168,85,247,0.25), rgba(0,0,0,0) 60%)'
          : `radial-gradient(circle at 50% 50%, ${tier.color}33, rgba(0,0,0,0) 60%)`,
      }}
    >
      <div className="absolute top-4 font-mono text-xs text-white/60">holymog</div>
      <div
        className="font-sans text-[120px] font-black leading-none uppercase"
        style={letterStyle}
      >
        {tier.letter}
      </div>
      <div className="absolute bottom-4 px-2 text-center font-mono text-[10px] text-white/70">
        rate yours at holymog.com
      </div>
    </div>
  );
}
