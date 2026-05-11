'use client';

/**
 * A+ tier theme — "mogger". Green → teal gradient with a slow upward
 * glow drift. Last stop before S band — feels more confident than
 * chadlite, less ostentatious than chad.
 */
export default function ThemeMogger() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, #166534 0%, #064e3b 50%, #0a0a0a 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, rgba(20,184,166,0.18) 0%, transparent 65%)',
          animation: 'theme-mogger-drift 6s ease-in-out infinite alternate',
        }}
      />
      <style>{`
        @keyframes theme-mogger-drift {
          from { opacity: 0.7; transform: translateY(0); }
          to { opacity: 1; transform: translateY(-4%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="theme-mogger-drift"] { animation: none !important; }
        }
      `}</style>
    </>
  );
}
