'use client';

export function AccountStatsTab() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="text-4xl">📊</div>
      <div>
        <p className="text-sm text-white">no stats yet</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          play public battles to start earning ELO and tracking wins. your best
          scan&apos;s full breakdown will show up here once you scan as a signed-in user.
        </p>
      </div>
    </div>
  );
}
