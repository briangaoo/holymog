'use client';

/**
 * F tier theme — "subhuman". Darker, more saturated than ugly-af.
 * Crimson radial + subtle vertical scanline texture for an unsettling
 * "stuck in a CRT" vibe.
 */
export default function ThemeSubhuman() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at center, #0a0a0a 0%, #3f0a0a 50%, #991b1b 130%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.5) 0, rgba(0,0,0,0.5) 1px, transparent 1px, transparent 3px)',
        }}
      />
    </>
  );
}
