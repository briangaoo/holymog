'use client';

import { THEMES, type UserStats } from '@/lib/customization';

/**
 * Dev-only preview grid for the 11 tier themes. Each theme renders
 * full-bleed (position: fixed) in production. For preview, we wrap
 * each in a 320×220 box with `transform: translateZ(0)` — that turns
 * the wrapper into the containing block for fixed-positioned
 * descendants, so the theme paints inside the box instead of the
 * whole viewport.
 *
 * Smart themes (none in the tier set, but the signature stays uniform
 * with name-fx) get userStats passed through anyway.
 */
export function ThemesSection({ userStats }: { userStats: UserStats }) {
  const entries = Object.values(THEMES);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-[#f5f5f5] lowercase">
          tier themes ({entries.length})
        </h2>
        <p className="text-sm text-neutral-400 lowercase">
          full-bleed backgrounds behind your profile page. one per scan
          tier — scanning at tier X unlocks X and below.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((def) => {
          const ThemeComponent = def.component;
          return (
            <div
              key={def.slug}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <div
                className="relative h-[220px] w-full overflow-hidden rounded-t-xl bg-black"
                style={{ transform: 'translateZ(0)' }}
              >
                <ThemeComponent
                  userStats={def.smart ? userStats : undefined}
                />
                {/* tiny sample profile content on top — so we see how
                    the theme reads behind actual content */}
                <div className="absolute left-4 top-4 right-4 flex items-center gap-2">
                  <span className="h-7 w-7 rounded-full border border-white/20 bg-zinc-700" />
                  <span className="text-[13px] font-bold text-white">
                    briangao
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[12px] font-medium text-white">
                  {def.name}
                </span>
                <code className="text-[10px] text-neutral-500">
                  {def.slug}
                </code>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
