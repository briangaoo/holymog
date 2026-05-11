'use client';

/**
 * S- tier theme — "chad". Clean cyan → purple diagonal gradient. The
 * S-band debut. Static, confident, no motion.
 */
export default function ThemeChad() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'linear-gradient(135deg, #0c4a6e 0%, #1e1b4b 50%, #4c1d95 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.22) 0%, transparent 55%)',
        }}
      />
    </>
  );
}
