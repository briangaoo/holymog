'use client';

import { FRAMES, type UserStats } from '@/lib/customization';

const SIZES = [48, 96, 256] as const;

const AVATAR = (size: number) => (
  <div
    className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 text-zinc-400"
    style={{ fontSize: Math.max(8, size * 0.18) }}
  >
    {size >= 64 ? 'mog' : ''}
  </div>
);

export function FramesSection({ userStats }: { userStats: UserStats }) {
  const slugs = Object.keys(FRAMES);
  if (slugs.length === 0) {
    return (
      <section className="mb-12">
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">frames</h2>
        <p className="text-sm text-zinc-500">
          no frames registered. populate the FRAMES block in
          lib/customization.ts.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        frames ({slugs.length})
      </h2>
      <div className="space-y-6">
        {slugs.map((slug) => {
          const def = FRAMES[slug];
          const Component = def.component;
          return (
            <div
              key={slug}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
            >
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-sm font-medium text-zinc-200">
                  {def.name}
                </span>
                <code className="text-xs text-zinc-500">{def.slug}</code>
                {def.smart ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                    smart
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-6">
                {SIZES.map((size) => (
                  <div key={size} className="flex flex-col items-center gap-2">
                    <div
                      className="relative shrink-0"
                      style={{ width: size, height: size }}
                    >
                      <Component size={size} userStats={userStats}>
                        {AVATAR(size)}
                      </Component>
                    </div>
                    <span className="text-[10px] tabular-nums text-zinc-500">
                      {size}px
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
