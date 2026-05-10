'use client';

import { THEMES, type UserStats } from '@/lib/customization';

/**
 * Dev-only preview grid for all 15 themes. Each theme renders full-bleed
 * by design (position:fixed on the viewport). For preview, we mount it
 * inside a 400×300 absolute-positioned clipping wrapper that constrains
 * the fixed element visually — the theme still uses position:fixed in
 * production, but the overflow-hidden wrapper here gives us a framed
 * preview cell.
 *
 * Smart themes receive the same userStats prop passed by the parent
 * preview page so we can verify their behaviour at low/mid/high stat
 * levels.
 */
export function ThemesSection({ userStats }: { userStats: UserStats }) {
  const themes = Object.values(THEMES);
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-white">themes</h2>
        <p className="text-xs text-white/50">
          {themes.length} items · each clipped into a 400×300 preview cell
          (production renders full-bleed)
        </p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
        {themes.map((theme) => {
          const ThemeComponent = theme.component;
          return (
            <div
              key={theme.slug}
              className="flex flex-col gap-2"
            >
              <div className="relative h-[300px] w-[400px] overflow-hidden rounded-xl border border-white/10 bg-black">
                <div className="absolute inset-0">
                  <ThemeComponent
                    userStats={theme.smart ? userStats : undefined}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="font-mono">{theme.slug}</span>
                {theme.smart && (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-amber-300">
                    smart
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
