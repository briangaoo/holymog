'use client';

type BorderProps = {
  color: string | null;
};

/**
 * Tier-coloured viewport rim that breathes. Four layered linear-gradient
 * backgrounds (top / bottom / left / right) on a single fullscreen
 * overlay. Each gradient starts at the configured tier-colour-with-alpha
 * AT the screen edge and fades linearly to transparent over --aura-band
 * pixels. Linear (not gaussian) so the edge pixel actually hits the
 * configured alpha — at peak that's 100%. The @property-registered
 * --aura-band and --aura-alpha vars animate via the live-aura-breathe
 * keyframe in globals.css so the rim pulses width + intensity together.
 * Corners get double-intensity where the top band overlaps with the
 * left/right bands — reads as natural light pooling at the corners.
 */
export function LivePageBorder({ color }: BorderProps) {
  const visible = color !== null;
  const ring = color ?? 'transparent';
  const c = `color-mix(in srgb, ${ring} var(--aura-alpha), transparent)`;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        backgroundImage: visible
          ? [
              `linear-gradient(to bottom, ${c}, transparent)`,
              `linear-gradient(to top, ${c}, transparent)`,
              `linear-gradient(to right, ${c}, transparent)`,
              `linear-gradient(to left, ${c}, transparent)`,
            ].join(', ')
          : 'none',
        backgroundPosition: 'top, bottom, left, right',
        backgroundRepeat: 'no-repeat',
        backgroundSize: visible
          ? `100% var(--aura-band), 100% var(--aura-band), var(--aura-band) 100%, var(--aura-band) 100%`
          : 'auto',
        animation: visible ? 'live-aura-breathe 3.5s ease-in-out infinite' : 'none',
      }}
    />
  );
}
