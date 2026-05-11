import type { CSSProperties } from 'react';

/**
 * Base pill style for tier badges. Each tier gets its own gradient
 * background + (optionally) gradient text — call sites pass full CSS
 * `background` strings so any badge can have a 2-3-stop gradient,
 * radial, conic, etc.
 *
 * `textGradient()` is a helper for clipping a gradient to text — wrap
 * the badge text in a span with that style for per-tier gradient
 * letterforms on top of the pill background.
 */
export function pillStyle(opts: {
  size: number;
  background: string;
  border: string;
  glow?: string;
  weight?: 700 | 800 | 900;
  letterSpacing?: string;
  color?: string;
}): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    padding: '0 0.65em',
    fontSize: `${opts.size * 0.42}px`,
    fontWeight: opts.weight ?? 900,
    letterSpacing: opts.letterSpacing ?? '0.04em',
    textTransform: 'lowercase',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    borderRadius: 999,
    color: opts.color ?? '#ffffff',
    background: opts.background,
    border: `1px solid ${opts.border}`,
    boxShadow: opts.glow
      ? `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.55), 0 0 14px ${opts.glow}`
      : `inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.45)`,
  };
}

/**
 * Clip a gradient to text. Wrap the visible word in a span with this
 * style so the gradient flows through the letterforms instead of
 * painting the pill background.
 */
export function textGradient(gradient: string): CSSProperties {
  return {
    backgroundImage: gradient,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.45))',
  };
}
