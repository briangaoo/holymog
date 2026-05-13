'use client';

import { useCallback, useRef } from 'react';

/**
 * Cursor-reactive rim on a child element. The rim is rendered as a
 * radial-gradient sitting in a thin ring around the wrapper's edge —
 * masked using `mask-composite: exclude` so the gradient only shows
 * within the border thickness, not across the whole card.
 *
 * Implementation:
 *   - mousemove on the wrapper updates two CSS custom properties (--mx, --my)
 *     that drive the radial-gradient's anchor point in `px` units relative
 *     to the wrapper's bounding box.
 *   - the absolute-positioned rim layer reads those props in its
 *     `background` declaration. As the cursor moves, the gradient anchor
 *     follows in real time.
 *   - `padding` controls rim thickness (1.5px here); `mask-composite:
 *     exclude` carves out the inner area so only the rim is painted.
 *   - the inner `border-radius: inherit` keeps the rim curvature in sync
 *     with whatever radius the wrapper picks (cards use rounded-none).
 *
 * `accent` is the gradient's centre colour; outer fades to transparent.
 * Pass the brand colour for each card (emerald for scan, amber for battle).
 */
type Props = {
  accent: string;
  /** Visible thickness of the rim, in px. */
  thickness?: number;
  /**
   * Radius of the cursor spotlight inside the rim, in px. Set this
   * smaller (~120) on long, thin elements (the leaderboard pill) so
   * the gradient doesn't bleed across the whole element when the
   * cursor is near one edge. Cards can keep the default ~200.
   */
  spotlight?: number;
  className?: string;
  children: React.ReactNode;
};

export function SpectralRim({
  accent,
  thickness = 1.5,
  spotlight = 200,
  className = '',
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Use a ref + rAF guard to keep the mousemove → CSS-prop update path
  // 60fps without React re-renders.
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastRef.current = { x, y };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const point = lastRef.current;
      if (!point || !ref.current) return;
      ref.current.style.setProperty('--rim-x', `${point.x}px`);
      ref.current.style.setProperty('--rim-y', `${point.y}px`);
      ref.current.style.setProperty('--rim-on', '1');
    });
  }, []);

  const onLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty('--rim-on', '0');
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`relative ${className}`}
      style={
        {
          ['--rim-x' as never]: '50%',
          ['--rim-y' as never]: '50%',
          ['--rim-on' as never]: '0',
        } as React.CSSProperties
      }
    >
      {children}
      {/* Rim layer. inset:0 + border-radius:inherit pins it to the card
          edges. The gradient anchors at (--rim-x, --rim-y); spotlight
          radius and accent colour are tunable. mask-composite carves
          out everything except the `thickness`-wide ring. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
        style={{
          padding: `${thickness}px`,
          // Canonical radial-gradient syntax: `circle <radius> at <pos>`.
          // The earlier `${spotlight}px circle …` ordering was being
          // parsed as a default-extent ellipse, so the gradient spanned
          // the whole element. With `circle Npx`, the gradient is a
          // strict N-pixel disc anchored to (rim-x, rim-y) — opaque
          // at the centre, fully transparent by 50% of N.
          background: `radial-gradient(circle ${spotlight}px at var(--rim-x) var(--rim-y), ${accent}, transparent 50%)`,
          opacity: 'var(--rim-on, 0)',
          transition: 'opacity 0.25s ease-out',
          WebkitMask:
            'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
    </div>
  );
}
