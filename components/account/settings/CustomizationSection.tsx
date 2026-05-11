'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { NameFx } from '../../customization/NameFx';
import { NAME_FX, type NameFxDef } from '@/lib/customization';
import { Section, type SettingsProfile } from './shared';

/**
 * Launch 1 customization picker.
 *
 * Only name effects — no store, no monetization. Items are earned via
 * gameplay (achievement engine grants on scans / battles / streaks /
 * ELO milestones). User picks which earned effect to equip; can
 * unequip back to default.
 *
 * Locked items show greyed with their unlock condition so users see
 * what to chase. Frames, badges, and themes deferred to Launch 2.
 */

type CatalogItem = {
  kind: 'frame' | 'badge' | 'theme' | 'name_fx';
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
};

type CatalogResponse = {
  items: CatalogItem[];
  owned: string[];
  equipped: {
    frame: string | null;
    theme: string | null;
    flair: string | null;
    name_fx: string | null;
  };
};

export function CustomizationSection({ profile }: { profile: SettingsProfile }) {
  const { user } = useUser();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as CatalogResponse;
      setData(json);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const equip = useCallback(
    async (slug: string) => {
      setPending(slug);
      setError(null);
      try {
        const res = await fetch('/api/account/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? 'could not equip');
          return;
        }
        await refresh();
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const unequip = useCallback(async () => {
    setPending('unequip-name_fx');
    setError(null);
    try {
      const res = await fetch('/api/account/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'name_fx' }),
      });
      if (!res.ok) {
        setError('could not unequip');
        return;
      }
      await refresh();
    } finally {
      setPending(null);
    }
  }, [refresh]);

  if (!user || !data) {
    return (
      <Section
        id="customization"
        label="customization"
        description="name effects you've earned."
        icon={Sparkles}
        accent="emerald"
      >
        <div className="border-t border-white/5 px-4 py-4 text-[13px] text-zinc-500">
          loading…
        </div>
      </Section>
    );
  }

  const nameFxInRegistry = Object.values(NAME_FX);
  const ownedSet = new Set(data.owned);
  const ownedNameFx = nameFxInRegistry.filter((n) => ownedSet.has(n.slug));
  const lockedNameFx = nameFxInRegistry.filter((n) => !ownedSet.has(n.slug));

  return (
    <Section
      id="customization"
      label="customization"
      description="name effects you've earned. unlock more by scanning, battling, climbing."
      icon={Sparkles}
      accent="emerald"
      meta={
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {ownedNameFx.length} unlocked · {nameFxInRegistry.length} total
        </span>
      }
    >
      <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-5">
        <header className="flex items-baseline justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-zinc-200">name effect</span>
            <span className="text-[11px] text-zinc-500">
              applied to your display name everywhere
            </span>
          </div>
          {data.equipped.name_fx && (
            <button
              type="button"
              onClick={() => void unequip()}
              disabled={pending === 'unequip-name_fx'}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
            >
              unequip
            </button>
          )}
        </header>

        {ownedNameFx.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            no name effects yet — scan once to unlock signed.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ownedNameFx.map((n) => (
              <NameFxOption
                key={n.slug}
                def={n}
                displayName={profile.display_name}
                equipped={data.equipped.name_fx === n.slug}
                pending={pending === n.slug}
                onClick={() => void equip(n.slug)}
              />
            ))}
          </div>
        )}

        {lockedNameFx.length > 0 && (
          <details className="text-[12px] text-zinc-500">
            <summary className="cursor-pointer text-zinc-400 transition-colors hover:text-white">
              {lockedNameFx.length} locked
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {lockedNameFx.map((n) => (
                <LockedNameFxOption key={n.slug} def={n} />
              ))}
            </div>
          </details>
        )}
      </div>

      {error && (
        <div className="border-t border-white/5 px-4 py-2 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </Section>
  );
}

function NameFxOption({
  def,
  displayName,
  equipped,
  pending,
  onClick,
}: {
  def: NameFxDef;
  displayName: string;
  equipped: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
        equipped
          ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
      } disabled:opacity-50`}
    >
      <span className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          {def.name}
        </span>
        <span className="text-[18px] font-bold text-white">
          <NameFx slug={def.slug}>{displayName}</NameFx>
        </span>
      </span>
      {equipped && (
        <Check size={14} aria-hidden className="text-emerald-300" />
      )}
    </button>
  );
}

function LockedNameFxOption({ def }: { def: NameFxDef }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.015] px-3.5 py-2.5 opacity-50">
      <Lock size={11} aria-hidden className="text-zinc-600" />
      <span className="text-[12px] text-zinc-400">{def.name}</span>
      <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-zinc-600">
        locked
      </span>
    </div>
  );
}
