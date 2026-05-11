'use client';

/**
 * F+ tier theme — "chopped". Smoldering ember gradient transitioning
 * from crimson at the bottom to dark sky above. Subtle warm pulse
 * keeps it alive.
 */
export default function ThemeChopped() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, #0a0a0a 0%, #1c0606 35%, #7c2d12 75%, #ea580c 115%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.30) 0%, transparent 60%)',
          animation: 'theme-chopped-pulse 4s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes theme-chopped-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="theme-chopped-pulse"] { animation: none !important; opacity: 0.9 !important; }
        }
      `}</style>
    </>
  );
}
