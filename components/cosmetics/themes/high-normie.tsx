'use client';

/**
 * B tier theme — "high normie". Lime → green gradient with a faint
 * upper glow. First tier that feels "fresh" rather than muted.
 */
export default function ThemeHighNormie() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 25%, #3f6212 0%, #1a2e05 60%, #0a0a0a 110%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(132,204,22,0.15) 0%, transparent 55%)',
        }}
      />
    </>
  );
}
