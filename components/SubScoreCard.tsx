'use client';

import { useEffect, useRef, useState } from 'react';

const COUNT_DURATION_MS = 2400;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Props = {
  label: string;
  finalValue: number;
  startDelayMs: number;
  start: boolean;
};

export function SubScoreCard({ label, finalValue, startDelayMs, start }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const delayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;

    delayTimerRef.current = window.setTimeout(() => {
      const startTs = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - startTs) / COUNT_DURATION_MS);
        const eased = easeOutCubic(t);
        setDisplayed(Math.round(finalValue * eased));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else setDisplayed(finalValue);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, startDelayMs);

    return () => {
      if (delayTimerRef.current !== null) window.clearTimeout(delayTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [start, finalValue, startDelayMs]);

  return (
    <div className="flex h-[160px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </div>
      <div className="flex flex-1 items-end justify-center">
        <span
          className="font-mono font-semibold tabular-nums text-white"
          style={{
            fontSize: 'clamp(40px, 12vw, 64px)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayed}
        </span>
      </div>
    </div>
  );
}
