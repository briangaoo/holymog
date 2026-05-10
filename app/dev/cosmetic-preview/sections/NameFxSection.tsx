'use client';

import { NameFx } from '@/components/customization/NameFx';
import type { UserStats } from '@/lib/customization';

/**
 * Name FX preview row for the /dev/cosmetic-preview page. Each of the
 * 14 effects wraps the same display text ("briangao") at the typical
 * profile name size so visual differences are directly comparable.
 *
 * Smart effects (tier-prefix, callout, streak-flame, elo-king,
 * score-overlay) re-render whenever the parent flips the userStats
 * toggle on the preview page.
 */

const NAME_FX_SLUGS = [
  'name.embossed-gold',
  'name.carved-obsidian',
  'name.smoke-trail',
  'name.frosted-glass',
  'name.ink-bleed',
  'name.pixelsort',
  'name.aurora',
  'name.signed',
  'name.tier-prefix',
  'name.callout',
  'name.streak-flame',
  'name.elo-king',
  'name.divine-judgment',
  'name.score-overlay',
] as const;

const DISPLAY_NAME = 'briangao';

export function NameFxSection({ userStats }: { userStats: UserStats }) {
  return (
    <section style={{ padding: '24px 0' }}>
      <h2
        style={{
          fontSize: 14,
          letterSpacing: '0.08em',
          color: 'rgba(245,245,245,0.55)',
          marginBottom: 18,
          textTransform: 'uppercase',
        }}
      >
        name fx · 14
      </h2>
      <ul
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 28,
          rowGap: 36,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {NAME_FX_SLUGS.map((slug) => (
          <li
            key={slug}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '32px 16px 18px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              minHeight: 110,
            }}
          >
            <div
              style={{
                fontSize: 24,
                lineHeight: 1.2,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 32,
              }}
            >
              <NameFx slug={slug} userStats={userStats}>
                {DISPLAY_NAME}
              </NameFx>
            </div>
            <code
              style={{
                fontSize: 11,
                color: 'rgba(245,245,245,0.4)',
                fontFamily:
                  'var(--font-mono-numeric), ui-monospace, monospace',
              }}
            >
              {slug}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}
