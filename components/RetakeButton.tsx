'use client';

import { RotateCcw } from 'lucide-react';

type Props = { onClick: () => void };

export function RetakeButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retake photo"
      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] text-sm font-medium text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
      style={{ touchAction: 'manipulation' }}
    >
      <RotateCcw size={16} aria-hidden />
      Retake
    </button>
  );
}
