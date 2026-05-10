'use client';

import { BADGES, type UserStats } from '@/lib/customization';

const SIZES = [22, 64] as const;

/**
 * Dev-only preview grid for the 15 badge cosmetics. Renders each at the
 * inline display size (22px) and the store-card size (64px). The single
 * smart badge — `badge.tier-stamp` — receives the `userStats` prop from
 * the parent preview page so the toggle there can swap tier letters.
 */
export function BadgesSection({ userStats }: { userStats: UserStats }) {
  const entries = Object.values(BADGES);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-[#f5f5f5] lowercase">badges ({entries.length})</h2>
        <p className="text-sm text-neutral-400 lowercase">
          inline (22px) + store preview (64px). hover scales slightly.
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
                  <p className="truncate text-sm font-medium text-[#f5f5f5] lowercase">{def.name}</p>
                  <p className="truncate text-xs text-neutral-500 lowercase">{def.slug}</p>
                </div>
                {def.smart ? (
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                    smart
                  </span>
                ) : null}
              </div>
              <div className="flex items-end justify-around gap-4 rounded-lg bg-[#0a0a0a] py-4">
                {SIZES.map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <div
                      className="transition-transform duration-150 hover:scale-110"
                      style={{ width: s, height: s }}
                    >
                      <Component size={s} userStats={userStats} />
                    </div>
                    <span className="text-[10px] text-neutral-500">{s}px</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-400 lowercase">{def.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
