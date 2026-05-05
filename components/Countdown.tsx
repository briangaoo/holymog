'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Props = { durationMs: number };

export function Countdown({ durationMs }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationMs / 1000));

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, durationMs - elapsed);
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  if (secondsLeft <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={`Capturing in ${secondsLeft} seconds`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={secondsLeft}
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
          className="font-sans text-white"
          style={{
            fontSize: 'clamp(180px, 50vw, 360px)',
            fontWeight: 900,
            lineHeight: 1,
            textShadow: '0 6px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.6)',
          }}
        >
          {secondsLeft}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
