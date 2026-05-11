'use client';

import { BADGES, type UserStats } from '@/lib/customization';

/**
 * Dev-only preview grid for the 11 tier badges. Renders each at the
 * actual inline display size (22px) — the same height they sit at
 * next to a display name in production. No oversized preview; that
 * was the old "store card" size which never matched real use.
 *
 * Shows each badge inline with a sample display name so we see the
 * pill in its native context, not floating in isolation.
 */
export function BadgesSection({ userStats }: { userStats: UserStats }) {
  const entries = Object.values(BADGES);
  const SAMPLE_NAME = 'briangao';

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-[#f5f5f5] lowercase">
          badges ({entries.length})
        </h2>
        <p className="text-sm text-neutral-400 lowercase">
          inline pills next to your name. 36px tall — sample name shown
          for realistic context.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((def) => {
          const Component = def.component;
          return (
            <div
              key={def.slug}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#f5f5f5] lowercase">
                    {def.name}
                  </p>
                  <p className="truncate text-xs text-neutral-500 lowercase">
                    {def.slug}
                  </p>
                </div>
                {def.smart ? (
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                    smart
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] px-4 py-4">
                <span className="text-[15px] font-bold text-white">
                  {SAMPLE_NAME}
                </span>
                <Component size={36} userStats={userStats} />
              </div>
              <p className="mt-3 text-xs text-neutral-400 lowercase">
                {def.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
