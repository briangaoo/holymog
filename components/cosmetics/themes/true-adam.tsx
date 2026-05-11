'use client';

/**
 * S+ tier theme — "true adam". The marquee theme. Animated cyan →
 * purple → pink → gold cycle + a soft gold halo glow at the top of
 * the viewport. Strongest visual presence of any tier.
 */
export default function ThemeTrueAdam() {
  return (
    <>
      {/* base animated gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'linear-gradient(115deg, #0c4a6e 0%, #4c1d95 30%, #831843 55%, #78350f 80%, #0c4a6e 100%)',
          backgroundSize: '250% 250%',
          animation: 'theme-true-adam-cycle 18s linear infinite',
        }}
      />
      {/* gold halo at the top */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(253,224,71,0.28) 0%, transparent 70%)',
          animation: 'theme-true-adam-halo 5s ease-in-out infinite',
        }}
      />
      {/* iridescent center glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 60%, rgba(168,85,247,0.18) 0%, transparent 55%)',
        }}
      />
      <style>{`
        @keyframes theme-true-adam-cycle {
          0% { background-position: 0% 50%; }
          100% { background-position: 250% 50%; }
        }
        @keyframes theme-true-adam-halo {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="theme-true-adam-cycle"],
          [style*="theme-true-adam-halo"] {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
