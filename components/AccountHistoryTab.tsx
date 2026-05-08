'use client';

export function AccountHistoryTab() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="text-4xl">⌛</div>
      <div>
        <p className="text-sm text-white">history coming soon</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          your past battles will show up here with opponent, ELO change, and result.
        </p>
      </div>
    </div>
  );
}
