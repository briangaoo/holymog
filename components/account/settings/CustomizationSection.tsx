'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { NameFx } from '../../customization/NameFx';
import {
  NAME_FX,
  type NameFxDef,
  type UserStats,
} from '@/lib/customization';
import { Section, type SettingsProfile } from './shared';

/**
 * Launch 1 customization picker.
 *
 * Only name effects — no store, no monetization. Items are earned via
 * gameplay (achievement engine grants on scans / battles / streaks /
 * ELO milestones). The picker shows:
 *   - the user's owned name fx (live preview of the effect on their
 *     display name, using their real stats so smart effects render
 *     accurately — tier-prefix shows their actual tier letter etc.)
 *   - locked name fx with a faded preview of what they'd unlock,
 *     rendered against representative mock stats so smart effects
 *     visibly demonstrate the look even though the user hasn't
 *     crossed the threshold yet.
 *   - the catalog description per item so the user knows exactly
 *     what to do to earn each one.
 *
 * Frames, badges, and themes deferred to Launch 2.
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

/**
 * Mock stats used to render locked name fx previews. Picked so every
 * smart effect has data to display (tier letter S-, 7-win streak,
 * 1500 ELO, weakest sub-score, etc) — gives the user a real preview
 * of what they'd unlock, not an empty wrapper.
 */
const LOCKED_PREVIEW_STATS: UserStats = {
  elo: 1500,
  bestScanOverall: 88,
  currentStreak: 7,
  currentWinStreak: 7,
  matchesWon: 25,
  weakestSubScore: 'jawline',
};

const EMPTY_STATS: UserStats = {
  elo: null,
  bestScanOverall: null,
  currentStreak: null,
  currentWinStreak: null,
  matchesWon: null,
  weakestSubScore: null,
};

export function CustomizationSection({
  profile,
  onRefresh,
}: {
  profile: SettingsProfile;
  onRefresh?: () => void | Promise<void>;
}) {
  const { user } = useUser();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [userStats, setUserStats] = useState<UserStats>(EMPTY_STATS);
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

  // Pull live userStats from /api/account/me so owned smart effects
  // preview accurately (tier-prefix shows their real tier, elo-king
  // shows their real ELO, etc). Separate from /api/catalog because
  // the catalog endpoint is shared with logged-out browsing.
  const refreshUserStats = useCallback(async () => {
    try {
      const res = await fetch('/api/account/me', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        profile?: {
          elo?: number | null;
          best_scan_overall?: number | null;
          current_streak?: number | null;
          matches_won?: number | null;
        } | null;
        weakest_sub_score?: UserStats['weakestSubScore'];
      };
      const p = json.profile;
      if (!p) return;
      setUserStats({
        elo: p.elo ?? null,
        bestScanOverall: p.best_scan_overall ?? null,
        currentStreak: p.current_streak ?? null,
        currentWinStreak: p.current_streak ?? null,
        matchesWon: p.matches_won ?? null,
        weakestSubScore: json.weakest_sub_score ?? null,
      });
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshUserStats();
  }, [refresh, refreshUserStats]);

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
        if (onRefresh) void onRefresh();
      } finally {
        setPending(null);
      }
    },
    [refresh, onRefresh],
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
      if (onRefresh) void onRefresh();
    } finally {
      setPending(null);
    }
  }, [refresh, onRefresh]);

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

  // catalog descriptions are the "how to earn it" copy (e.g. "unlocked
  // by completing your first scan"). Look up by slug.
  const descBySlug = new Map<string, string | null>(
    data.items.map((i) => [i.slug, i.description]),
  );

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
                userStats={userStats}
                equipped={data.equipped.name_fx === n.slug}
                pending={pending === n.slug}
                onClick={() => void equip(n.slug)}
              />
            ))}
          </div>
        )}

        {lockedNameFx.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              locked · {lockedNameFx.length}
            </span>
            <div className="flex flex-col gap-2">
              {lockedNameFx.map((n) => (
                <LockedNameFxOption
                  key={n.slug}
                  def={n}
                  displayName={profile.display_name}
                  description={descBySlug.get(n.slug) ?? null}
                />
              ))}
            </div>
          </div>
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
  userStats,
  equipped,
  pending,
  onClick,
}: {
  def: NameFxDef;
  displayName: string;
  userStats: UserStats;
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
          <NameFx slug={def.slug} userStats={userStats}>
            {displayName}
          </NameFx>
        </span>
      </span>
      {equipped && (
        <Check size={14} aria-hidden className="text-emerald-300" />
      )}
    </button>
  );
}

function LockedNameFxOption({
  def,
  displayName,
  description,
}: {
  def: NameFxDef;
  displayName: string;
  description: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/5 bg-white/[0.015] px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col gap-1.5 opacity-60">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            <Lock size={10} aria-hidden />
            {def.name}
          </span>
          <span className="text-[18px] font-bold text-white">
            <NameFx slug={def.slug} userStats={LOCKED_PREVIEW_STATS}>
              {displayName}
            </NameFx>
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          locked
        </span>
      </div>
      {description && (
        <span className="text-[11px] leading-relaxed text-zinc-400">
          {description}
        </span>
      )}
    </div>
  );
}
