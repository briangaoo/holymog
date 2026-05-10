'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { Frame } from '@/components/customization/Frame';
import { Badge } from '@/components/customization/Badge';
import { NameFx } from '@/components/customization/NameFx';
import {
  getFrame,
  getBadge,
  getNameFx,
  getTheme,
} from '@/lib/customization';

type CatalogKind = 'frame' | 'badge' | 'theme' | 'name_fx';

type CatalogItem = {
  kind: CatalogKind;
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

type TabKey = CatalogKind;
type TabSpec = { key: TabKey; label: string; price: string };

/**
 * Each category has a flat price. Same price for every item in the
 * category, regardless of design complexity. Premium-aesthetic dollar
 * amounts (no $3.99 nonsense). The price chip in each tab shows the
 * per-category rate.
 */
const TABS: readonly TabSpec[] = [
  { key: 'frame', label: 'frames', price: '$6' },
  { key: 'badge', label: 'badges', price: '$4' },
  { key: 'name_fx', label: 'name fx', price: '$8' },
  { key: 'theme', label: 'themes', price: '$10' },
] as const;

/**
 * /account/store
 *
 * Discord-style storefront. Four tabs (frames / badges / name fx /
 * themes) each rendering a grid of cosmetic items. Preview area on
 * each card shows the actual cosmetic via the registered renderer
 * (not a static screenshot) — so the moment a registry entry lands,
 * its store card lights up.
 *
 * Catalog data comes from /api/catalog. Items with no registry entry
 * still render (with placeholder previews) so we don't accidentally
 * hide DB-listed items pending registry population.
 *
 * Click flow:
 *   - equipped → unequip (POST /api/account/unequip)
 *   - owned + not equipped → equip (POST /api/account/equip)
 *   - paid + not owned → Stripe Checkout (POST /api/checkout/create-session)
 *   - free + not owned → cannot reach UI; free items are auto-granted
 *     at signup via the catalog seed migration
 *   - anon → AuthModal
 */
export default function StorePage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [tab, setTab] = useState<TabKey>('frame');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

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

  const filtered = useMemo(
    () => (data?.items ?? []).filter((i) => i.kind === tab),
    [data, tab],
  );

  const onAction = useCallback(
    async (item: CatalogItem) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      setPending(item.slug);
      setError(null);
      try {
        const owned = data?.owned.includes(item.slug);
        const equippedSlot = equippedSlotFor(item.kind, data?.equipped);
        const isEquipped = equippedSlot === item.slug;

        if (isEquipped) {
          // Currently equipped → unequip.
          const apiKind = item.kind === 'badge' ? 'flair' : item.kind;
          const res = await fetch('/api/account/unequip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: apiKind }),
          });
          if (!res.ok) {
            setError('could not unequip');
            return;
          }
        } else if (owned) {
          // Owned but not equipped → equip.
          const res = await fetch('/api/account/equip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: item.slug }),
          });
          if (!res.ok) {
            setError('could not equip');
            return;
          }
        } else if (item.price_cents === 0) {
          // Free + not owned. Free items are normally auto-granted at
          // signup; if we hit this path it's a config/seed mismatch.
          setError('free items are auto-granted at signup');
          return;
        } else {
          // Paid + not owned → Stripe Checkout.
          const res = await fetch('/api/checkout/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [item.slug] }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
              message?: string;
            };
            setError(body.message ?? body.error ?? 'checkout failed');
            return;
          }
          const json = (await res.json()) as { url: string };
          window.location.href = json.url;
          return;
        }
        await refresh();
      } finally {
        setPending(null);
      }
    },
    [user, data, refresh],
  );

  if (loading) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account/store" />
        <main className="mx-auto w-full max-w-2xl px-5 py-8 text-sm text-zinc-500">
          loading…
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      {/* Ambient page wash — sky + violet at corners. Same vibe as
          the home page Starfield but lighter. */}
      <span
        aria-hidden
        className="pointer-events-none fixed -top-32 -right-32 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.10) 0%, transparent 60%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none fixed -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 60%)',
        }}
      />

      <AppHeader authNext="/account/store" />
      <main className="relative mx-auto w-full max-w-3xl px-5 py-6">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <h1 className="text-[24px] font-extrabold tracking-tight text-foreground">
            store
          </h1>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            flat pricing · $4 → $10
          </span>
        </header>

        {/* Tab bar — 4 pills in a single rounded container */}
        <nav
          aria-label="store categories"
          className="mb-6 flex w-fit gap-1 rounded-full border border-white/8 bg-white/[0.02] p-1"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{ touchAction: 'manipulation' }}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-foreground text-[#0a0a0a]'
                    : 'text-zinc-400 hover:text-foreground'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    active
                      ? 'bg-black/15 text-[#0a0a0a]'
                      : 'bg-white/[0.04] text-zinc-500'
                  }`}
                >
                  {t.price}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Section head */}
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[14px] font-bold tracking-tight text-foreground">
            {sectionTitleFor(tab)}
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}

        {!data ? (
          <p className="text-[13px] text-zinc-500">loading catalog…</p>
        ) : filtered.length === 0 ? (
          <EmptyState kind={tab} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const owned = data.owned.includes(item.slug);
              const equippedSlot = equippedSlotFor(item.kind, data.equipped);
              const equipped = equippedSlot === item.slug;
              return (
                <CatalogCard
                  key={item.slug}
                  item={item}
                  owned={owned}
                  equipped={equipped}
                  pending={pending === item.slug}
                  onAction={() => void onAction(item)}
                />
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-center text-[10px] text-zinc-600">
          purchases are processed by stripe. all sales final once equipped.{' '}
          <Link
            href="/terms"
            className="underline-offset-2 hover:text-zinc-400 hover:underline"
          >
            terms
          </Link>
        </p>
      </main>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        next="/account/store"
        context="to purchase"
      />
    </div>
  );
}

// ---- Card -------------------------------------------------------------------

function CatalogCard({
  item,
  owned,
  equipped,
  pending,
  onAction,
}: {
  item: CatalogItem;
  owned: boolean;
  equipped: boolean;
  pending: boolean;
  onAction: () => void;
}) {
  const dollarLabel = item.price_cents === 0
    ? 'free'
    : `$${(item.price_cents / 100).toFixed(0)}`;

  const action = equipped ? 'unequip' : owned ? 'equip' : dollarLabel;
  const stateLabel = equipped ? '✓ equipped' : owned ? 'owned' : 'not owned';
  const stateColor = equipped
    ? 'text-emerald-300'
    : owned
      ? 'text-zinc-300'
      : 'text-zinc-500';

  return (
    <li
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-5 backdrop-blur transition-all hover:-translate-y-[3px] hover:border-white/15 hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)]"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
      }}
    >
      <CardPreview item={item} />

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-[14px] font-bold tracking-tight text-foreground">
          {item.name}
        </span>
        {item.description && (
          <span className="text-[12px] leading-relaxed text-zinc-400">
            {item.description}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-4">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${stateColor}`}
        >
          {stateLabel}
        </span>
        <button
          type="button"
          onClick={onAction}
          disabled={pending}
          style={{ touchAction: 'manipulation' }}
          className={
            equipped
              ? 'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:bg-white/[0.07] disabled:opacity-40'
              : owned
                ? 'inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40'
                : 'inline-flex items-center gap-1 rounded-full bg-foreground px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0a0a0a] transition-transform hover:scale-[1.04] disabled:opacity-40'
          }
        >
          {pending ? (
            <Loader2 size={11} className="animate-spin" aria-hidden />
          ) : equipped ? (
            <>
              <Check size={11} aria-hidden /> {action}
            </>
          ) : (
            action
          )}
        </button>
      </div>
    </li>
  );
}

// ---- Preview ---------------------------------------------------------------

function CardPreview({ item }: { item: CatalogItem }) {
  return (
    <div
      className="flex h-[160px] items-center justify-center overflow-hidden rounded-xl"
      style={{
        background:
          'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.04), transparent 70%)',
      }}
    >
      {previewFor(item)}
    </div>
  );
}

function previewFor(item: CatalogItem): React.ReactNode {
  if (item.kind === 'frame') {
    const frame = getFrame(item.slug);
    return (
      <Frame slug={item.slug} size={104}>
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 text-2xl font-extrabold text-white">
          B
        </span>
      </Frame>
    );
  }
  if (item.kind === 'badge') {
    const badge = getBadge(item.slug);
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5">
        <Badge slug={item.slug} />
        <span className="text-[13px] font-semibold text-foreground">briangao</span>
      </span>
    );
  }
  if (item.kind === 'name_fx') {
    return (
      <NameFx slug={item.slug}>
        <span className="text-[26px] font-extrabold tracking-tight text-foreground">
          briangao
        </span>
      </NameFx>
    );
  }
  // theme — mount the registered theme component in a clipped preview frame.
  // Themes are designed for full-bleed; we wrap in an overflow-hidden box
  // so the preview shows a representative slice of the effect.
  const theme = getTheme(item.slug);
  if (theme) {
    const ThemeComponent = theme.component;
    return (
      <span
        className="relative h-full w-full overflow-hidden rounded-lg"
        aria-hidden
      >
        <ThemeComponent />
      </span>
    );
  }
  return (
    <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
      preview pending
    </span>
  );
}

// ---- Empty state -----------------------------------------------------------

function EmptyState({ kind }: { kind: TabKey }) {
  const labels: Record<TabKey, { headline: string; sub: string }> = {
    frame: {
      headline: 'frames coming soon',
      sub: 'animated rings around your avatar — visible in battles, leaderboards, and on your profile.',
    },
    badge: {
      headline: 'badges coming soon',
      sub: 'small flair next to your name — shows everywhere your name appears.',
    },
    name_fx: {
      headline: 'name fx coming soon',
      sub: 'animated treatments for your display name — applies on your profile, in battles, on the leaderboard.',
    },
    theme: {
      headline: 'themes coming soon',
      sub: 'full-bleed ambient layer behind your profile — the ultimate flex.',
    },
  };
  const { headline, sub } = labels[kind];

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <span className="text-[22px]">✦</span>
      </div>
      <p className="text-[15px] font-semibold text-foreground">{headline}</p>
      <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-zinc-400">
        {sub}
      </p>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
        check back soon
      </p>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------

function sectionTitleFor(tab: TabKey): string {
  switch (tab) {
    case 'frame':
      return 'frames · avatar rings';
    case 'badge':
      return 'badges · name pills';
    case 'name_fx':
      return 'name fx · text treatments';
    case 'theme':
      return 'themes · full-bleed flair';
  }
}

function equippedSlotFor(
  kind: CatalogKind,
  equipped: CatalogResponse['equipped'] | undefined,
): string | null {
  if (!equipped) return null;
  if (kind === 'frame') return equipped.frame;
  if (kind === 'theme') return equipped.theme;
  if (kind === 'name_fx') return equipped.name_fx;
  return equipped.flair;
}
