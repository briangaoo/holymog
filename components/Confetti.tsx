'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

const PARTICLE_COUNT = 80;

type Props = {
  fire: boolean;
  color: string;
  isGradient: boolean;
};

export function Confetti({ fire, color, isGradient }: Props) {
  useEffect(() => {
    if (!fire) return;
    const colors = isGradient ? ['#22d3ee', '#a855f7', '#7c3aed'] : [color, '#ffffff'];
    confetti({
      particleCount: PARTICLE_COUNT,
      spread: 70,
      origin: { x: 0.05, y: 1 },
      angle: 60,
      colors,
      startVelocity: 55,
      gravity: 1,
      ticks: 200,
    });
    confetti({
      particleCount: PARTICLE_COUNT,
      spread: 70,
      origin: { x: 0.95, y: 1 },
      angle: 120,
      colors,
      startVelocity: 55,
      gravity: 1,
      ticks: 200,
    });
  }, [fire, color, isGradient]);

  return null;
}
