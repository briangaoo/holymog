'use client';

/**
 * Full-viewport loading spinner. Used while a route's first paint is
 * blocked on data (e.g. /leaderboard prefetching both Scans + Battles
 * tabs in parallel). Pure CSS — no JS animation cost.
 */
export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black"
    >
      <span className="relative h-14 w-14">
        {/* Track */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-white/10"
        />
        {/* Spinner: 3/4 ring, rotating. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{
            borderTopColor: 'rgba(255,255,255,0.85)',
            borderRightColor: 'rgba(255,255,255,0.55)',
            borderBottomColor: 'rgba(255,255,255,0.25)',
            animation: 'hm-spin 0.9s linear infinite',
          }}
        />
      </span>
      {label && (
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">
          {label}
        </span>
      )}
      <style>{`
        @keyframes hm-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
