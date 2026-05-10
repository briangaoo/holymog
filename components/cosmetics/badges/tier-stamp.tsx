'use client';

import { useId } from 'react';
import { getTier } from '@/lib/tier';
import type { UserStats } from '@/lib/customization';

const DARK = '#0a0a0a';
const PLACEHOLDER = '#525252';

/**
 * SMART badge — reads userStats.bestScanOverall, runs it through getTier(),
 * and stamps the resulting tier letter inside a square frame coloured with
 * the tier's brand colour. S-tier letters use the cyan→purple gradient.
 * When no scan exists yet, renders a muted '?' placeholder.
 */
export default function BadgeTierStamp({
  size,
  userStats,
}: {
  size: number;
  userStats?: UserStats;
}) {
  const gradId = useId().replace(/:/g, '');
  const score = userStats?.bestScanOverall ?? null;
  const hasScan = score !== null && score !== undefined;
  const tier = hasScan ? getTier(score) : null;

  const accent = !tier
    ? PLACEHOLDER
    : tier.isGradient
      ? `url(#${gradId}-fill)`
      : tier.color;

  const letter = tier?.letter ?? '?';
  // Single-char tiers (F, D, C, ...) get a bigger glyph than 2-char (S+).
  const fontSize = letter.length >= 2 ? 26 : 34;

  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={`${gradId}-stroke`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="10" fill={DARK} />
        {/* outer stamp ring */}
        <rect
          x="5"
          y="5"
          width="54"
          height="54"
          rx="8"
          fill="none"
          stroke={tier?.isGradient ? `url(#${gradId}-stroke)` : accent}
          strokeWidth="3"
        />
        {/* faint corner ticks for "stamp" feel */}
        <g opacity="0.35" stroke={tier?.isGradient ? `url(#${gradId}-stroke)` : accent} strokeWidth="1.4" strokeLinecap="round">
          <line x1="11" y1="11" x2="14" y2="11" />
          <line x1="11" y1="11" x2="11" y2="14" />
          <line x1="53" y1="11" x2="50" y2="11" />
          <line x1="53" y1="11" x2="53" y2="14" />
          <line x1="11" y1="53" x2="14" y2="53" />
          <line x1="11" y1="53" x2="11" y2="50" />
          <line x1="53" y1="53" x2="50" y2="53" />
          <line x1="53" y1="53" x2="53" y2="50" />
        </g>
        <text
          x="32"
          y="33"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="800"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
          fill={accent}
          letterSpacing={letter.length >= 2 ? -1 : 0}
        >
          {letter}
        </text>
      </svg>
    </span>
  );
}
