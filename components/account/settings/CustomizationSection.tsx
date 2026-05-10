'use client';

import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { Frame } from '../../customization/Frame';
import { Badge } from '../../customization/Badge';
import { NameFx } from '../../customization/NameFx';
import { getBadge, getFrame, getNameFx, getTheme } from '@/lib/customization';
import { Section, type SettingsProfile } from './shared';

/**
 * Settings glance at currently equipped customization. Lives between
 * notifications and the account/security block. Doesn't itself host the
 * equip picker — that's the storefront — but shows the current state and
 * a "browse store" entry.
 */
export function CustomizationSection({ profile }: { profile: SettingsProfile }) {
  const { user } = useUser();
  const frame = getFrame(profile.equipped_frame);
  const badge = getBadge(profile.equipped_flair);
  const theme = getTheme(profile.equipped_theme);
  const nameFx = getNameFx(profile.equipped_name_fx);

  return (
    <Section
      id="customization"
      label="customization"
      description="frames, badges, and themes you've equipped."
      icon={Sparkles}
      accent="emerald"
      meta={
        <Link
          href="/account/store"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/[0.12]"
        >
          browse store <ArrowRight size={11} aria-hidden />
        </Link>
      }
    >
      <CustomRow
        slot="frame"
        title={frame ? frame.name : 'no frame'}
        equipped={profile.equipped_frame !== null}
        preview={
          <Frame slug={profile.equipped_frame} size={44}>
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                {profile.display_name.charAt(0).toUpperCase() || '?'}
              </span>
            )}
          </Frame>
        }
      />

      <CustomRow
        slot="badge"
        title={badge ? badge.name : 'no badge'}
        equipped={profile.equipped_flair !== null}
        preview={
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
            {badge ? (
              <Badge slug={profile.equipped_flair} />
            ) : (
              <span className="text-[11px] text-zinc-600">—</span>
            )}
          </span>
        }
      />

      <CustomRow
        slot="theme"
        title={theme ? theme.name : 'no theme'}
        equipped={profile.equipped_theme !== null}
        preview={
          <span
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] text-[10px] text-zinc-500"
            aria-hidden
          >
            {theme ? '◐' : '—'}
          </span>
        }
      />

      <CustomRow
        slot="name fx"
        title={nameFx ? nameFx.name : 'no name fx'}
        equipped={profile.equipped_name_fx !== null}
        preview={
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-[11px]">
            <NameFx slug={profile.equipped_name_fx}>
              <span className="font-semibold text-white">
                {profile.display_name.charAt(0).toUpperCase() || '?'}
              </span>
            </NameFx>
          </span>
        }
      />
    </Section>
  );
}

function CustomRow({
  slot,
  title,
  equipped,
  preview,
}: {
  slot: string;
  title: string;
  equipped: boolean;
  preview: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-white/5 px-4 py-4 transition-colors hover:bg-white/[0.015]">
      {preview}
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-medium text-white">{title}</span>
        <span className="text-[11px] text-zinc-500">{slot}</span>
      </div>
      {equipped && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
          <Check size={11} aria-hidden /> equipped
        </span>
      )}
    </div>
  );
}
