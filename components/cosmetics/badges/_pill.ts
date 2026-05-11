import type { CSSProperties } from 'react';

/**
 * Shared base style for tier badge pills. Discord-verified-style depth:
 * solid saturated background + inner top highlight + inner bottom
 * shadow + outer drop shadow. Optional outer glow for top-tier badges
 * (mogger and above).
 *
 * Used by every basic tier badge so the visual language stays
 * consistent. The S-band trio (chad / heartbreaker / true-adam) layers
 * gradient text on top of this base.
 */
export function pillStyle(opts: {
  size: number;
  fg: string;
  bg: string;
  border: string;
  glow?: string;
  weight?: 700 | 800 | 900;
  letterSpacing?: string;
}): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    padding: '0 0.6em',
    fontSize: `${opts.size * 0.58}px`,
    fontWeight: opts.weight ?? 800,
    letterSpacing: opts.letterSpacing ?? '0.04em',
    textTransform: 'lowercase',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    borderRadius: 999,
    color: opts.fg,
    backgroundColor: opts.bg,
    border: `1px solid ${opts.border}`,
    boxShadow: opts.glow
      ? `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.40), 0 1px 2px rgba(0,0,0,0.55), 0 0 14px ${opts.glow}`
      : `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.45)`,
  };
}
