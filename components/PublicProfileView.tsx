'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Calendar,
  Hash,
  MapPin,
  Scan,
  Share2,
  Sparkles,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { getTier, getTierDescriptor } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { FRAMES, BADGES, type UserStats } from '@/lib/customization';
import { AvatarFallback } from './AvatarFallback';
import { Frame } from './customization/Frame';
import { Badge } from './customization/Badge';
import { NameFx } from './customization/NameFx';
import { ThemeAmbient } from './customization/ThemeAmbient';
import { Sparkline } from './Sparkline';
import type { PublicProfileData } from '@/lib/publicProfile';

type SocialKey = 'instagram' | 'x' | 'snapchat' | 'tiktok' | 'discord';

const SOCIAL_META: Record<SocialKey, { label: string; url: (h: string) => string | null }> = {
  instagram: { label: 'instagram', url: (h) => `https://instagram.com/${h.replace(/^@/, '')}` },
  x: { label: 'x', url: (h) => `https://x.com/${h.replace(/^@/, '')}` },
  snapchat: { label: 'snapchat', url: (h) => `https://snapchat.com/add/${h.replace(/^@/, '')}` },
  tiktok: { label: 'tiktok', url: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}` },
  discord: { label: 'discord', url: () => null },
};

/**
 * Twitter-style public profile.
 *
 * Layout (top → bottom):
 *   1. Banner — full-width image (or accent gradient fallback) ~180px tall.
 *      The avatar overlaps the bottom edge by ~40%.
 *   2. Identity row — display name + @handle + edit/follow button on the
 *      right. Below: bio. Below that: meta (location, joined, last seen).
 *   3. Followers / following counts as inline links.
 *   4. Socials chips, equipped badge inline next to display name.
 *   5. Mog stats — separate section: tier card + climb chart + battle
 *      log + tier distribution + collection.
 */
export function PublicProfileView({ data }: { data: PublicProfileData }) {
  const tier =
    data.best_scan_overall !== null ? getTier(data.best_scan_overall) : null;
  const losses = data.matches_played - data.matches_won;
  const winRate =
    data.matches_played > 0
      ? Math.round((data.matches_won / data.matches_played) * 100)
      : null;
  const tierAccent = tier?.isGradient
    ? '#a855f7'
    : (tier?.color ?? 'rgba(245,245,245,0.20)');

  // userStats — full set, since this is the profile page and we have
  // every field available. Smart cosmetics (live tier prefix, score
  // overlay, streak flame, etc.) consume this from every renderer
  // mounted below.
  const userStats: UserStats = {
    elo: data.elo,
    bestScanOverall: data.best_scan_overall,
    currentStreak: data.current_streak,
    currentWinStreak: data.current_streak,
    matchesWon: data.matches_won,
    weakestSubScore: data.weakest_sub_score,
  };

  return (
    <div className="relative flex flex-col gap-5 pb-10">
      {/* Equipped theme — full-bleed image or video behind the entire
          profile page. Renders nothing when no theme is equipped, so the
          tier-coloured wash below shows through as the default. */}
      <ThemeAmbient slug={data.equipped_theme} userStats={userStats} />

      {/* Tier-coloured radial wash anchored at top. Always rendered;
          when a theme is equipped this sits above the theme asset and
          adds a subtle accent. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[28rem] w-[140%] -translate-x-1/2 blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${tierAccent}1f, transparent 65%)`,
        }}
      />

      <ProfileHeader data={data} tierAccent={tierAccent} userStats={userStats} />

      <MogStats
        data={data}
        winRate={winRate}
        losses={losses}
      />
    </div>
  );
}

// ============================================================================
// PROFILE HEADER — banner + avatar + name + bio + actions (X-style)
// ============================================================================

function ProfileHeader({
  data,
  tierAccent,
  userStats,
}: {
  data: PublicProfileData;
  tierAccent: string;
  userStats: UserStats;
}) {
  const tier =
    data.best_scan_overall !== null ? getTier(data.best_scan_overall) : null;

  return (
    <section
      className="relative overflow-hidden rounded-sm border border-white/10"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.40)',
      }}
    >
      {/* Banner. Either the user's banner_url, or a tier-coloured
          fallback so accounts without a banner still look intentional. */}
      <div
        className="relative h-36 w-full overflow-hidden sm:h-44"
        style={{
          background: data.banner_url
            ? undefined
            : tier?.isGradient
              ? 'linear-gradient(135deg, #22d3ee 0%, #a855f7 50%, #ec4899 100%)'
              : `linear-gradient(135deg, ${tierAccent}80 0%, ${tierAccent}20 100%)`,
        }}
      >
        {data.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.banner_url}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        {/* Soft top sheen to lift the banner off the page bg */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.30) 100%)',
          }}
        />
      </div>

      {/* Avatar overlapping the banner */}
      <div className="relative px-5 sm:px-6">
        <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
          <Frame slug={data.equipped_frame} size={104} userStats={userStats}>
            {data.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarFallback seed={data.display_name} textClassName="text-3xl" />
            )}
          </Frame>
          <div className="flex translate-y-2 items-center gap-2">
            <ShareButton displayName={data.display_name} />
            {data.is_own_profile ? (
              <EditProfileButton />
            ) : (
              <FollowButton
                username={data.display_name}
                initiallyFollowing={data.viewer_is_following ?? false}
              />
            )}
          </div>
        </div>

        {/* Identity row */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-extrabold leading-none tracking-tight text-foreground sm:text-[28px]">
              <NameFx slug={data.equipped_name_fx} userStats={userStats}>
                {data.display_name}
              </NameFx>
            </h1>
            {data.equipped_flair && (
              <Badge slug={data.equipped_flair} userStats={userStats} />
            )}
            {tier?.isGradient && (
              <span
                aria-label="elite tier"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(34,211,238,0.30), rgba(168,85,247,0.30))',
                  boxShadow: 'inset 0 0 0 1px rgba(168,85,247,0.50)',
                }}
              >
                <Sparkles size={10} aria-hidden /> elite
              </span>
            )}
          </div>
          <span className="text-[15px] text-zinc-400">
            @{data.display_name}
          </span>

          {data.bio && (
            <p className="mt-1 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">
              {data.bio}
            </p>
          )}

          {/* Meta strip — location, joined, last seen */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-400">
            {data.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} aria-hidden />
                {data.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={13} aria-hidden />
              joined {formatJoined(data.account_age_days)}
            </span>
            {data.last_active_at && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActive(data.last_active_at)
                      ? 'animate-pulse bg-white'
                      : 'bg-zinc-600'
                  }`}
                />
                last seen {formatRelativeShort(data.last_active_at)}
              </span>
            )}
          </div>

          {/* Followers / following — Twitter-style inline counts.
              Each links through to the dedicated list page so a viewer
              can browse who's following whom. */}
          <div className="mt-1 flex flex-wrap items-center gap-4 text-[14px]">
            <Link
              href={`/@${data.display_name}/following`}
              className="inline-flex items-baseline gap-1.5 hover:underline underline-offset-4"
            >
              <span className="font-num font-extrabold tabular-nums text-foreground">
                {formatCount(data.following_count)}
              </span>
              <span className="text-zinc-400">following</span>
            </Link>
            <Link
              href={`/@${data.display_name}/followers`}
              className="inline-flex items-baseline gap-1.5 hover:underline underline-offset-4"
            >
              <span className="font-num font-extrabold tabular-nums text-foreground">
                {formatCount(data.followers_count)}
              </span>
              <span className="text-zinc-400">
                {data.followers_count === 1 ? 'follower' : 'followers'}
              </span>
            </Link>
          </div>

          {/* Socials chips — only when set */}
          {hasAnySocial(data.socials) && (
            <div className="mt-2 flex flex-wrap gap-1.5 pb-5">
              {(Object.keys(data.socials) as SocialKey[]).map((k) => {
                const handle = data.socials[k];
                if (!handle) return null;
                return <SocialPill key={k} kind={k} handle={handle} />;
              })}
            </div>
          )}
        </div>
        {!hasAnySocial(data.socials) && <div className="pb-5" />}
      </div>
    </section>
  );
}

// ============================================================================
// FOLLOW + EDIT BUTTONS
// ============================================================================

function FollowButton({
  username,
  initiallyFollowing,
}: {
  username: string;
  initiallyFollowing: boolean;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (!user) {
      // No session: bounce to sign-in with this profile as the
      // post-auth landing target.
      router.push(`/?signin=1&next=${encodeURIComponent(`/@${username}`)}`);
      return;
    }
    const next = !following;
    setFollowing(next); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch(`/api/account/${username}/follow`, {
          method: next ? 'POST' : 'DELETE',
        });
        if (!res.ok) {
          setFollowing(!next);
        } else {
          // Refresh the server data so follower count updates without
          // a client-side fetch round-trip.
          router.refresh();
        }
      } catch {
        setFollowing(!next);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{ touchAction: 'manipulation' }}
      className={
        following
          ? 'inline-flex h-9 items-center rounded-full border border-white/15 bg-transparent px-4 text-[14px] font-semibold text-foreground transition-colors hover:border-white hover:bg-white/[0.06] hover:text-white disabled:opacity-50'
          : 'inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-[#0a0a0a] transition-transform hover:scale-[1.03] disabled:opacity-50'
      }
    >
      {following ? 'following' : 'follow'}
    </button>
  );
}

function EditProfileButton() {
  return (
    <Link
      href="/account"
      className="inline-flex h-9 items-center rounded-full border border-white/15 bg-transparent px-4 text-[14px] font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
    >
      edit profile
    </Link>
  );
}

function ShareButton({ displayName }: { displayName: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const onShare = async () => {
    const url = `${window.location.origin}/@${displayName}`;
    const navWithShare = navigator as Navigator & {
      share?: (data: { url: string; title: string }) => Promise<void>;
    };
    if (typeof navWithShare.share === 'function') {
      try {
        await navWithShare.share({
          title: `@${displayName} on holymog`,
          url,
        });
        return;
      } catch {
        // ignore
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={onShare}
      style={{ touchAction: 'manipulation' }}
      aria-label={copied ? 'link copied' : 'share profile'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-zinc-200 transition-colors hover:bg-white/[0.10] hover:text-foreground"
    >
      <Share2 size={14} aria-hidden />
    </button>
  );
}

// ============================================================================
// MOG STATS — tier card + climb + battles + tier distribution + collection
// ============================================================================

function MogStats({
  data,
  winRate,
  losses,
}: {
  data: PublicProfileData;
  winRate: number | null;
  losses: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionLabel icon={Swords} accent="rose">
        mog stats
      </SectionLabel>

      <TierCard data={data} />

      <StatStrip data={data} winRate={winRate} losses={losses} />

      {data.elo !== null && data.elo_sparkline.length >= 2 && (
        <ClimbChart
          sparkline={data.elo_sparkline}
          elo={data.elo}
          peakElo={data.peak_elo ?? data.elo}
        />
      )}

      {data.matches_played > 0 && (
        <BattleActivity battles={data.recent_battles} />
      )}

      {data.inventory_slugs.length > 0 && (
        <CollectionShelf slugs={data.inventory_slugs} />
      )}
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  accent,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  accent: 'rose' | 'sky';
  children: React.ReactNode;
}) {
  // Brutalist: accent prop preserved at the type level but all variants
  // render identical monochrome treatment.
  void accent;
  const color = 'text-white';
  return (
    <div className="flex items-center gap-2 px-1">
      <Icon size={15} aria-hidden className={color} />
      <span
        className={`text-[14px] font-bold uppercase tracking-[0.16em] ${color}`}
      >
        {children}
      </span>
      <span aria-hidden className="ml-2 h-px flex-1 bg-white/10" />
    </div>
  );
}

// ---- Tier card -----------------------------------------------------------

function TierCard({ data }: { data: PublicProfileData }) {
  const tier =
    data.best_scan_overall !== null ? getTier(data.best_scan_overall) : null;
  const descriptor = tier ? getTierDescriptor(tier.letter) : null;
  const isElite = tier?.isGradient ?? false;
  const accentColor = tier?.isGradient
    ? '#a855f7'
    : (tier?.color ?? 'rgba(245,245,245,0.20)');

  return (
    <div className="rounded-sm">
      <section
        className="relative overflow-hidden rounded-sm border"
        style={{
          borderColor: `${accentColor}40`,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
          style={{
            background: isElite
              ? 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(34,211,238,0.20) 40%, transparent 70%)'
              : `radial-gradient(circle, ${accentColor}80 0%, ${accentColor}30 40%, transparent 70%)`,
          }}
        />
        <div className="relative grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6 sm:p-7">
          {data.best_scan_photo ? (
            <div
              className="relative mx-auto h-32 w-32 flex-shrink-0 overflow-hidden rounded-sm sm:mx-0 sm:h-36 sm:w-36"
              style={{
                boxShadow: `0 0 0 2px ${accentColor}60, 0 0 32px ${accentColor}50`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.best_scan_photo}
                alt={`${data.display_name}'s top scan`}
                className="h-full w-full object-cover"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, transparent 60%, ${accentColor}30 100%)`,
                }}
              />
            </div>
          ) : (
            <div className="mx-auto flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-sm border border-white/10 bg-white/[0.02] sm:mx-0 sm:h-36 sm:w-36">
              <Scan size={20} className="text-zinc-500" aria-hidden />
              <span className="text-[11px] text-zinc-500">no scan yet</span>
            </div>
          )}

          <div className="flex flex-col gap-2 text-center sm:text-left">
            <span className="text-[12px] font-semibold text-zinc-400">
              Top scan ever
            </span>
            {tier ? (
              <>
                <div className="flex items-baseline justify-center gap-3 sm:justify-start">
                  <span
                    className="font-num leading-none tabular-nums"
                    style={{
                      fontSize: 'clamp(56px, 14vw, 96px)',
                      fontWeight: 900,
                      letterSpacing: '-0.04em',
                      color: getScoreColor(data.best_scan_overall ?? 0),
                      filter: `drop-shadow(0 0 24px ${accentColor}80)`,
                    }}
                  >
                    {data.best_scan_overall}
                  </span>
                  <span
                    className="font-num text-5xl font-extrabold leading-none uppercase sm:text-6xl"
                    style={tierLetterStyle(tier)}
                  >
                    {tier.letter}
                  </span>
                </div>
                {descriptor && (
                  <span className="text-[14px] font-medium uppercase tracking-[0.12em] text-zinc-300">
                    {descriptor}
                  </span>
                )}
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                  {isElite ? (
                    'top of the board. mogger of moggers.'
                  ) : (
                    <>
                      currently in the{' '}
                      <span className="uppercase">{tier.letter}</span> tier band.
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="text-[14px] text-zinc-400">
                hasn't taken a scan yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- Stat strip ----------------------------------------------------------

function StatStrip({
  data,
  winRate,
  losses,
}: {
  data: PublicProfileData;
  winRate: number | null;
  losses: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <StatChip
        label="ELO"
        value={data.elo === null ? '—' : String(data.elo)}
        sub={
          data.peak_elo !== null && data.peak_elo !== data.elo
            ? `Peak ${data.peak_elo}`
            : null
        }
        accent={data.elo === null ? 'zinc' : 'sky'}
      />
      <StatChip
        label="Record"
        value={
          data.matches_played === 0
            ? '—'
            : `${data.matches_won}-${losses}`
        }
        accent={winRate !== null && winRate >= 50 ? 'emerald' : 'zinc'}
      />
      <StatChip
        label="Win rate"
        value={winRate === null ? '—' : `${winRate}%`}
        accent={winRate !== null && winRate >= 50 ? 'emerald' : 'zinc'}
      />
      <StatChip
        label="Streak"
        value={String(data.current_streak)}
        sub={
          data.longest_streak > 0 ? `Best ${data.longest_streak}` : null
        }
        accent={data.current_streak >= 3 ? 'emerald' : 'zinc'}
      />
      <StatChip
        label="Scans"
        value={String(data.total_scans)}
        accent="zinc"
      />
      <StatChip
        label="Battles"
        value={String(data.matches_played)}
        accent="zinc"
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string | null;
  accent: 'sky' | 'emerald' | 'zinc';
}) {
  // Map the accent prop to a semantic colour: sky for ELO / neutral
  // numbers, emerald for positive stats (best scan, wins), zinc for
  // muted ones.
  const valueColor =
    accent === 'sky'
      ? 'text-sky-300'
      : accent === 'emerald'
        ? 'text-emerald-300'
        : 'text-white';
  return (
    <div
      className="overflow-hidden rounded-sm border border-white/10 px-3 py-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
      }}
    >
      <div className="text-[12px] font-medium text-zinc-400">{label}</div>
      <div
        className={`font-num mt-1.5 text-[22px] font-extrabold tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </div>
      {sub && (
        <div className="font-num mt-1.5 text-[11px] tabular-nums text-zinc-500">
          {sub}
        </div>
      )}
    </div>
  );
}

// ---- Climb chart ---------------------------------------------------------

function ClimbChart({
  sparkline,
  elo,
  peakElo,
}: {
  sparkline: number[];
  elo: number;
  peakElo: number;
}) {
  const min = Math.min(...sparkline);
  const max = Math.max(...sparkline);
  const trend = sparkline[sparkline.length - 1] - sparkline[0];
  return (
    <div className="rounded-sm">
      <section
        className="relative overflow-hidden rounded-sm border border-white/20"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 60%)',
          backdropFilter: 'blur(18px) saturate(170%)',
          WebkitBackdropFilter: 'blur(18px) saturate(170%)',
        }}
      >
        <div className="flex flex-col gap-3 p-5">
          <header className="flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-white/80" aria-hidden />
              <span className="text-[14px] font-semibold text-white">
                ELO climb
              </span>
            </div>
            <span className="font-num text-[12px] tabular-nums text-zinc-400">
              {sparkline.length} battles
            </span>
          </header>

          <div className="flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-num text-[28px] font-extrabold tabular-nums text-foreground">
                {elo}
              </span>
              {trend !== 0 && (
                <span
                  className={`font-num text-[14px] font-semibold tabular-nums ${
                    trend > 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {trend > 0 ? '+' : ''}
                  {trend}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-num text-[11px] tabular-nums text-zinc-400">
                peak {peakElo}
              </span>
              <span className="font-num text-[11px] tabular-nums text-zinc-500">
                low {min}
              </span>
              <span className="font-num text-[11px] tabular-nums text-zinc-500">
                high {max}
              </span>
            </div>
          </div>

          <Sparkline
            points={sparkline}
            width={580}
            height={56}
            stroke="rgba(255,255,255,0.95)"
            fill="rgba(255,255,255,0.18)"
          />
        </div>
      </section>
    </div>
  );
}

// ---- Battle log ----------------------------------------------------------

function BattleActivity({
  battles,
}: {
  battles: PublicProfileData['recent_battles'];
}) {
  const ordered = [...battles].reverse();
  return (
    <div className="rounded-sm">
      <section
        className="relative overflow-hidden rounded-sm border border-white/20"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 60%)',
          backdropFilter: 'blur(18px) saturate(170%)',
          WebkitBackdropFilter: 'blur(18px) saturate(170%)',
        }}
      >
        <div className="flex flex-col gap-3 p-5">
          <header className="flex items-center gap-2">
            <Swords size={15} className="text-white/70" aria-hidden />
            <span className="text-[14px] font-semibold text-white/80">
              Recent battles
            </span>
          </header>

          <div className="flex gap-1">
            {Array.from({ length: 5 - ordered.length }).map((_, i) => (
              <span
                key={`pad-${i}`}
                aria-hidden
                className="h-2.5 flex-1 rounded-sm bg-white/[0.04]"
              />
            ))}
            {ordered.map((b) => (
              <span
                key={b.battle_id}
                title={b.is_winner ? 'win' : 'loss'}
                className={`h-2.5 flex-1 rounded-sm ${
                  b.is_winner ? 'bg-emerald-400' : 'bg-rose-500/80'
                }`}
              />
            ))}
          </div>

          <ul className="flex flex-col gap-1.5">
            {battles.map((b) => (
              <BattleActivityRow key={b.battle_id} battle={b} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/**
 * Public-profile counterpart to the AccountHistoryTab row. Same
 * rank-chip + tap-to-expand pattern, but anchored to a profile
 * viewer's perspective (i.e. the rank is the OWNER's rank in that
 * battle, not the viewer's). Replaces the old binary W/L badge —
 * for 3+ player parties the binary doesn't say enough.
 */
function BattleActivityRow({
  battle,
}: {
  battle: PublicProfileData['recent_battles'][number];
}) {
  const { rank, total } = computeRankFromOpponents(
    battle.peak_score,
    battle.opponents,
  );
  const rankStyle = battleRankStyle(rank, total);
  const canExpand = total > 2;

  const firstOpp = battle.opponents[0];
  const extra = battle.opponents.length - 1;

  const standings = [
    { display_name: '(owner)', peak_score: battle.peak_score, isOwner: true },
    ...battle.opponents.map((o) => ({
      display_name: o.display_name,
      peak_score: o.peak_score,
      isOwner: false,
    })),
  ].sort((a, b) => b.peak_score - a.peak_score);

  // Hover for pointer devices via CSS group-hover. Tap-to-toggle for
  // touch devices — `tapped` state inlines the expanded styles so
  // the expansion works whether or not :hover ever fires.
  const [tapped, setTapped] = useState(false);
  const expandedInline = tapped
    ? {
        maxHeight: 400,
        opacity: 1,
        paddingTop: 8,
        paddingBottom: 8,
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }
    : {};

  return (
    <li className="group overflow-hidden rounded-sm border border-white/[0.04] bg-white/[0.01] transition-colors hover:bg-white/[0.025]">
      <button
        type="button"
        onClick={() => canExpand && setTapped((t) => !t)}
        disabled={!canExpand}
        className="flex w-full min-h-[44px] items-center gap-3 px-3 py-2.5 text-left text-[14px] disabled:cursor-default"
        style={{ touchAction: 'manipulation' }}
        aria-expanded={canExpand ? tapped : undefined}
      >
        <span
          className="inline-flex h-7 min-w-[28px] flex-shrink-0 items-center justify-center px-1.5 font-num text-[12px] font-bold tabular-nums"
          style={{
            background: rankStyle.bg,
            color: rankStyle.text,
            borderRadius: 2,
            border: `1px solid ${rankStyle.border}`,
          }}
          title={`${rank} of ${total}`}
        >
          {rank}
        </span>
        <span className="flex-1 truncate text-zinc-200">
          {firstOpp ? (
            <>
              vs{' '}
              <Link
                href={`/@${firstOpp.display_name}`}
                className="text-foreground hover:underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                @{firstOpp.display_name}
              </Link>
              {extra > 0 && (
                <span className="ml-1 text-zinc-400">+{extra}</span>
              )}
            </>
          ) : (
            <span className="text-zinc-500">solo</span>
          )}
        </span>
        <span className="font-num flex items-center gap-1 text-[13px] tabular-nums">
          <span style={{ color: getScoreColor(battle.peak_score) }}>
            {battle.peak_score}
          </span>
          {firstOpp && (
            <>
              <span className="text-zinc-700">·</span>
              <span style={{ color: getScoreColor(firstOpp.peak_score) }}>
                {firstOpp.peak_score}
              </span>
            </>
          )}
        </span>
        {battle.finished_at && (
          <span className="font-num w-12 text-right text-[11px] tabular-nums text-zinc-500">
            {formatRelativeShort(battle.finished_at)}
          </span>
        )}
      </button>
      {canExpand && (
        <ul
          className="flex max-h-0 flex-col gap-px overflow-hidden bg-black/40 px-3 opacity-0 transition-all ease-out group-hover:max-h-[400px] group-hover:border-t group-hover:border-white/10 group-hover:py-2 group-hover:opacity-100"
          style={{ transitionDuration: '250ms', ...expandedInline }}
        >
          {standings.map((p, idx) => {
            const placeRank = idx + 1;
            const placeStyle = battleRankStyle(placeRank, total);
            const sCol = getScoreColor(p.peak_score);
            return (
              <li
                key={`${battle.battle_id}-${p.display_name}-${idx}`}
                className={`flex items-center gap-2 border-l-2 px-2 py-1.5 text-[12px] ${
                  p.isOwner ? 'bg-white/[0.05]' : 'bg-white/[0.01]'
                }`}
                style={{ borderColor: placeStyle.border }}
              >
                <span
                  className="font-num inline-flex h-5 min-w-[20px] items-center justify-center px-1 text-[10px] font-bold tabular-nums"
                  style={{
                    background: placeStyle.bg,
                    color: placeStyle.text,
                    borderRadius: 2,
                  }}
                >
                  {placeRank}
                </span>
                {p.isOwner ? (
                  <span className="flex-1 truncate text-white">
                    owner
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/40">
                      (profile)
                    </span>
                  </span>
                ) : (
                  <Link
                    href={`/@${p.display_name}`}
                    className="flex-1 truncate text-zinc-200 hover:text-white hover:underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{p.display_name}
                  </Link>
                )}
                <span
                  className="font-num text-[13px] font-bold tabular-nums"
                  style={{ color: sCol }}
                >
                  {p.peak_score}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function computeRankFromOpponents(
  myScore: number,
  opponents: Array<{ peak_score: number }>,
): { rank: number; total: number } {
  const better = opponents.filter((o) => o.peak_score > myScore).length;
  return { rank: better + 1, total: opponents.length + 1 };
}

function battleRankStyle(
  rank: number,
  total: number,
): { bg: string; text: string; border: string } {
  if (rank === 1) {
    return {
      bg: 'rgba(16,185,129,0.20)',
      text: '#6ee7b7',
      border: 'rgba(16,185,129,0.5)',
    };
  }
  if (rank === total && total >= 2) {
    return {
      bg: 'rgba(244,63,94,0.18)',
      text: '#fda4af',
      border: 'rgba(244,63,94,0.5)',
    };
  }
  if (rank === 2) {
    return {
      bg: 'rgba(226,232,240,0.12)',
      text: '#e2e8f0',
      border: 'rgba(226,232,240,0.45)',
    };
  }
  if (rank === 3) {
    return {
      bg: 'rgba(251,146,60,0.18)',
      text: '#fdba74',
      border: 'rgba(251,146,60,0.5)',
    };
  }
  return {
    bg: 'rgba(255,255,255,0.06)',
    text: 'rgba(255,255,255,0.6)',
    border: 'rgba(255,255,255,0.18)',
  };
}

// ---- Collection shelf ----------------------------------------------------

function CollectionShelf({ slugs }: { slugs: string[] }) {
  const ownedFrames = slugs.filter((s) => s in FRAMES);
  const ownedBadges = slugs.filter((s) => s in BADGES);
  if (ownedFrames.length === 0 && ownedBadges.length === 0) return null;

  return (
    <div className="rounded-sm">
      <section
        className="relative overflow-hidden rounded-sm border border-white/20"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 60%)',
          backdropFilter: 'blur(18px) saturate(170%)',
          WebkitBackdropFilter: 'blur(18px) saturate(170%)',
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <header className="flex items-center gap-2">
            <Sparkles size={15} className="text-white/80" aria-hidden />
            <span className="text-[14px] font-semibold text-white">
              Collection
            </span>
            <span className="ml-auto font-num text-[12px] tabular-nums text-zinc-400">
              {ownedFrames.length + ownedBadges.length} owned
            </span>
          </header>

          {ownedFrames.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-zinc-400">
                Frames
              </span>
              <div className="flex flex-wrap gap-3">
                {ownedFrames.map((slug) => {
                  const frame = FRAMES[slug];
                  return (
                    <div key={slug} className="flex flex-col items-center gap-1.5">
                      <Frame slug={slug} size={48}>
                        <span className="flex h-full w-full items-center justify-center bg-zinc-900 text-[12px] text-zinc-400">
                          ✦
                        </span>
                      </Frame>
                      <span className="text-[11px] text-zinc-300">
                        {frame.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ownedBadges.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-zinc-400">
                Badges
              </span>
              <div className="flex flex-wrap gap-2">
                {ownedBadges.map((slug) => {
                  const badge = BADGES[slug];
                  return (
                    <span
                      key={slug}
                      title={badge.description}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-zinc-200"
                    >
                      <Badge slug={slug} />
                      {badge.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function SocialPill({ kind, handle }: { kind: SocialKey; handle: string }) {
  const meta = SOCIAL_META[kind];
  const url = meta.url(handle);
  const HandlePrefixIcon = kind === 'discord' ? Hash : AtSign;
  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {meta.label}
      </span>
      <span className="inline-flex items-center gap-0.5 truncate max-w-[12rem] text-zinc-200">
        <HandlePrefixIcon size={11} aria-hidden className="text-zinc-500" />
        <span className="truncate">{handle.replace(/^@/, '')}</span>
      </span>
    </>
  );
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] transition-colors hover:bg-white/[0.07]"
      >
        {inner}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px]">
      {inner}
    </span>
  );
}

function hasAnySocial(socials: PublicProfileData['socials']): boolean {
  return (Object.keys(socials) as SocialKey[]).some((k) => Boolean(socials[k]));
}

// ============================================================================
// Helpers
// ============================================================================

function tierLetterStyle(
  tier: ReturnType<typeof getTier>,
): React.CSSProperties {
  // Tier letters MUST render uppercase (S+, A, B-, …) even though the
  // body globally lowercases everything via app/globals.css. Defense-
  // in-depth alongside the explicit `uppercase` class on each render
  // site — keeps the style helper authoritative if a className gets
  // dropped during a refactor.
  if (tier.isGradient) {
    return {
      backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textTransform: 'uppercase',
    };
  }
  return { color: tier.color, textTransform: 'uppercase' };
}

function formatJoined(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} mo ago`;
  }
  return `${Math.round(days / 365)} y ago`;
}

function formatRelativeShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(days / 365)}y`;
}

function isActive(iso: string): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
}
