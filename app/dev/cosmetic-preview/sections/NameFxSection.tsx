'use client';

import { NameFx } from '@/components/customization/NameFx';
import { NAME_FX, type UserStats } from '@/lib/customization';

/**
 * Name FX preview grid. Each registered name fx wraps the same display
 * text ("briangao") at profile name size so visual differences are
 * directly comparable. Smart effects re-render whenever the parent
 * flips the userStats toggle on the preview page.
 */

const DISPLAY_NAME = 'briangao';

export function NameFxSection({ userStats }: { userStats: UserStats }) {
  const entries = Object.values(NAME_FX);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-[#f5f5f5] lowercase">
          name fx ({entries.length})
        </h2>
        <p className="text-sm text-neutral-400 lowercase">
          all wrap the same name "{DISPLAY_NAME}" so differences are
          directly comparable. smart items track the toggle above.
        </p>
      </header>

      <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 p-0">
        {entries.map((def) => (
          <li
            key={def.slug}
            className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 pt-8 pb-4 backdrop-blur"
          >
            <div className="flex min-h-[40px] items-center justify-center text-[24px] font-bold">
              <NameFx slug={def.slug} userStats={userStats}>
                {DISPLAY_NAME}
              </NameFx>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <code className="text-[11px] text-neutral-500">{def.slug}</code>
              {def.smart && (
                <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                  smart
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
