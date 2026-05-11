'use client';

/**
 * F- tier theme — "ugly af". Deep blood-red corner vignette with a
 * near-black center. The rock-bottom theme. Static, no motion —
 * matches the "cope" energy.
 */
export default function ThemeUglyAf() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse at center, #0a0a0a 0%, #1c0606 55%, #7f1d1d 120%)',
      }}
    />
  );
}
