'use client';

/**
 * A tier theme — "chadlite". Forest green deep radial with a subtle
 * top-down glow. First aspirational theme — the mogging begins.
 */
export default function ThemeChadlite() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, #14532d 0%, #052e16 55%, #0a0a0a 105%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.22) 0%, transparent 60%)',
        }}
      />
    </>
  );
}
