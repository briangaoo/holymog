'use client';

import { useEffect, useRef, useState } from 'react';
import { getScoreColor } from '@/lib/scoreColor';

const COUNT_DURATION_MS = 2400;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Props = {
  label: string;
  finalValue: number;
  startDelayMs?: number;
  animate?: boolean;
  /** When true, the underlying score is a neutral placeholder because
   *  the vision API failed. We render "N/A" in muted gray + a flat
   *  empty bar so it doesn't read as a real score. */
  fallback?: boolean;
};

const NUMBER_FONT_STYLE: React.CSSProperties = {
  fontSize: 'clamp(40px, 11vw, 56px)',
  lineHeight: 1,
};

export function SubScoreCard({
  label,
  finalValue,
  startDelayMs = 0,
  animate = true,
  fallback = false,
}: Props) {
  const [displayed, setDisplayed] = useState(animate ? 0 : finalValue);
  const rafRef = useRef<number | null>(null);
  const delayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (fallback) {
      // No animation when there's no real score to count up to.
      return;
    }
    if (!animate) {
      setDisplayed(finalValue);
      return;
    }
    setDisplayed(0);
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
  }, [animate, finalValue, startDelayMs, fallback]);

  if (fallback) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-sm font-medium text-zinc-300">{label}</div>
          <div
            className="font-num font-extrabold text-zinc-500"
            style={NUMBER_FONT_STYLE}
          >
            N/A
          </div>
        </div>
        <div className="h-[10px] w-full overflow-hidden rounded-full bg-white/[0.06]" />
      </div>
    );
  }

  const fillColor = getScoreColor(displayed);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-sm font-medium text-zinc-300">{label}</div>
        <div className="font-num font-extrabold text-white" style={NUMBER_FONT_STYLE}>
          {displayed}
        </div>
      </div>
      <div className="h-[10px] w-full overflow-hidden rounded-full bg-white/12">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-200 ease-out"
          style={{
            width: `${Math.max(0, Math.min(100, displayed))}%`,
            background: fillColor,
          }}
        />
      </div>
    </div>
  );
}
