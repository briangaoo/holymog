'use client';

/**
 * S tier theme — "heartbreaker". Animated cyan → purple → pink wash
 * that slowly cycles. More motion than chad, less marquee than
 * true-adam.
 */
export default function ThemeHeartbreaker() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'linear-gradient(135deg, #0c4a6e 0%, #4c1d95 40%, #831843 80%, #0c4a6e 100%)',
          backgroundSize: '200% 200%',
          animation: 'theme-heartbreaker-cycle 12s linear infinite',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.18) 0%, transparent 60%)',
        }}
      />
      <style>{`
        @keyframes theme-heartbreaker-cycle {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="theme-heartbreaker-cycle"] {
            animation: none !important;
            background-position: 0 0 !important;
          }
        }
      `}</style>
    </>
  );
}
