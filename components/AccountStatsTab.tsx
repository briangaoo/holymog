'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Crown,
  Image as ImageIcon,
  LineChart,
  Sparkles,
  Swords,
  Trophy,
  TrendingDown,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { getTier, getTierDescriptor } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { computePresentation } from '@/lib/scoreEngine';
import { MoreDetail } from './MoreDetail';
import { Sparkline } from './Sparkline';
import { Section } from './account/settings/shared';
import type { FinalScores, VisionScore } from '@/types';

type Profile = {
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  matches_tied: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  best_scan: { vision: VisionScore; scores: FinalScores } | null;
  improvement_counts: Record<string, number>;
  created_at?: string | null;
  updated_at?: string | null;
};

type EloPoint = { elo: number; recorded_at: string };
type SwingEntry = {
  delta: number;
  opponent_display_name: string | null;
  finished_at: string | null;
};

type AccountResponse = {
  profile: Profile | null;
  entry?: { image_url?: string | null } | null;
  total_scans?: number;
  account_age_days?: number;
  highest_overall_ever?: number | null;
  elo_sparkline?: EloPoint[];
  most_improved?: { metric: string; delta: number } | null;
  recent_battle_results?: Array<'win' | 'loss' | 'tie'>;
  biggest_win?: SwingEntry | null;
  biggest_loss?: SwingEntry | null;
  scan_overalls?: number[];
};

// Kept in sync with BATTLE_IMPROVEMENT_OPTIONS in lib/vision.ts. The
// expanded set means lifetime weakness counters can fill from more
// dimensions than the original six — chin / brows / lips / forehead /
// symmetry are now first-class.
const IMPROVEMENT_KEYS = [
  'jawline',
  'cheekbones',
  'chin',
  'nose',
  'forehead',
  'symmetry',
  'eyes',
  'brows',
  'lips',
  'skin',
  'hair',
] as const;

const TIER_BANDS: Array<{ letter: string; min: number }> = [
  { letter: 'S+', min: 95 },
  { letter: 'S', min: 90 },
  { letter: 'S-', min: 87 },
  { letter: 'A', min: 73 },
  { letter: 'B', min: 58 },
  { letter: 'C', min: 43 },
  { letter: 'D', min: 28 },
  { letter: 'F', min: 0 },
];

/**
 * Stats tab — section-card layout matching the new settings vibe:
 * Discord-style accent colours per section, sentence-case headers,
 * larger fonts, hover micro-states on rows.
 *
 * Sections (top → bottom): identity, multiplayer, recent battles,
 * biggest swings, best scan, scan distribution, weakness frequency,
 * most-improved (when there's enough scan history).
 */
export function AccountStatsTab({
  initial,
}: {
  initial?: AccountResponse | null;
}) {
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(
    initial?.profile ?? null,
  );
  const [leaderboardPhoto, setLeaderboardPhoto] = useState<string | null>(
    initial?.entry?.image_url ?? null,
  );
  const [aggregates, setAggregates] = useState<{
    total_scans: number;
    account_age_days: number;
    highest_overall_ever: number | null;
    elo_sparkline: EloPoint[];
    most_improved: { metric: string; delta: number } | null;
    recent_battle_results: Array<'win' | 'loss' | 'tie'>;
    biggest_win: SwingEntry | null;
    biggest_loss: SwingEntry | null;
    scan_overalls: number[];
  }>({
    total_scans: initial?.total_scans ?? 0,
    account_age_days: initial?.account_age_days ?? 0,
    highest_overall_ever: initial?.highest_overall_ever ?? null,
    elo_sparkline: initial?.elo_sparkline ?? [],
    most_improved: initial?.most_improved ?? null,
    recent_battle_results: initial?.recent_battle_results ?? [],
    biggest_win: initial?.biggest_win ?? null,
    biggest_loss: initial?.biggest_loss ?? null,
    scan_overalls: initial?.scan_overalls ?? [],
  });
  const [loaded, setLoaded] = useState(initial != null);

  useEffect(() => {
    if (initial != null) return;
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as AccountResponse;
        if (cancelled) return;
        setProfile(data.profile);
        setLeaderboardPhoto(data.entry?.image_url ?? null);
        setAggregates({
          total_scans: data.total_scans ?? 0,
          account_age_days: data.account_age_days ?? 0,
          highest_overall_ever: data.highest_overall_ever ?? null,
          elo_sparkline: data.elo_sparkline ?? [],
          most_improved: data.most_improved ?? null,
          recent_battle_results: data.recent_battle_results ?? [],
          biggest_win: data.biggest_win ?? null,
          biggest_loss: data.biggest_loss ?? null,
          scan_overalls: data.scan_overalls ?? [],
        });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !loaded) return null;
  if (!profile) {
    return (
      <div className="border-2 border-white/20 bg-black p-4 text-center text-[11px] uppercase tracking-[0.18em] text-white/50" style={{ borderRadius: 2 }}>
        COULD NOT LOAD PROFILE
      </div>
    );
  }

  const ties = profile.matches_tied ?? 0;
  const losses = profile.matches_played - profile.matches_won - ties;
  // Ties excluded from the win-rate denominator so a string of draws
  // doesn't tank the user's perceived performance.
  const ratedMatches = profile.matches_played - ties;
  const winRate =
    ratedMatches > 0
      ? Math.round((profile.matches_won / ratedMatches) * 100)
      : null;
  const eloDelta = profile.elo - profile.peak_elo;

  return (
    <div className="flex flex-col gap-5">
      <IdentitySection
        profile={profile}
        accountAgeDays={aggregates.account_age_days}
        totalScans={aggregates.total_scans}
        highestOverallEver={aggregates.highest_overall_ever}
      />
      <MultiplayerSection
        elo={profile.elo}
        peakElo={profile.peak_elo}
        eloDelta={eloDelta}
        wins={profile.matches_won}
        ties={ties}
        losses={losses}
        winRate={winRate}
        played={profile.matches_played}
        currentStreak={profile.current_streak}
        longestStreak={profile.longest_streak}
        sparklinePoints={aggregates.elo_sparkline.map((p) => p.elo)}
      />
      {aggregates.recent_battle_results.length > 0 && (
        <RecentBattlesSection results={aggregates.recent_battle_results} />
      )}
      {(aggregates.biggest_win || aggregates.biggest_loss) && (
        <BiggestSwingsSection
          win={aggregates.biggest_win}
          loss={aggregates.biggest_loss}
        />
      )}
      <BestScanSection
        overall={profile.best_scan_overall}
        bestScan={profile.best_scan}
        leaderboardPhoto={leaderboardPhoto}
      />
      {aggregates.scan_overalls.length > 0 && (
        <TierDistributionSection scans={aggregates.scan_overalls} />
      )}
      <WeaknessSection counts={profile.improvement_counts} />
      {aggregates.most_improved && (
        <MostImprovedSection most={aggregates.most_improved} />
      )}
    </div>
  );
}

// ---- Identity ------------------------------------------------------------

function IdentitySection({
  profile,
  accountAgeDays,
  totalScans,
  highestOverallEver,
}: {
  profile: Profile;
  accountAgeDays: number;
  totalScans: number;
  highestOverallEver: number | null;
}) {
  const tier =
    profile.best_scan_overall !== null ? getTier(profile.best_scan_overall) : null;
  const descriptor = tier ? getTierDescriptor(tier.letter) : null;
  const highestTier =
    highestOverallEver !== null ? getTier(highestOverallEver) : null;

  return (
    <Section
      label="identity"
      description={`${profile.display_name} · ${formatAgeDays(accountAgeDays)} on holymog`}
      icon={User}
      accent="sky"
    >
      <Row label="username" value={profile.display_name} />
      {tier && (
        <Row
          label="current tier"
          value={
            <span className="inline-flex items-center gap-2">
              <span
                className="font-num text-base font-bold uppercase"
                style={tierLetterStyle(tier)}
              >
                {tier.letter}
              </span>
              {descriptor && (
                <span className="text-[12px] text-zinc-500">{descriptor}</span>
              )}
            </span>
          }
        />
      )}
      {highestOverallEver !== null && highestTier && (
        <Row
          label="highest score ever"
          value={
            <span className="inline-flex items-center gap-2">
              <span
                className="font-num text-base font-semibold tabular-nums"
                style={{ color: getScoreColor(highestOverallEver) }}
              >
                {highestOverallEver}
              </span>
              <span
                className="font-num text-base font-bold uppercase"
                style={tierLetterStyle(highestTier)}
              >
                {highestTier.letter}
              </span>
            </span>
          }
        />
      )}
      <Row
        label="lifetime"
        value={
          <span className="font-num tabular-nums text-[13px] text-zinc-200">
            {totalScans} scan{totalScans === 1 ? '' : 's'}
            <span className="mx-1.5 text-zinc-600">·</span>
            {profile.matches_played} battle{profile.matches_played === 1 ? '' : 's'}
          </span>
        }
      />
    </Section>
  );
}

// ---- Multiplayer ---------------------------------------------------------

function MultiplayerSection(props: {
  elo: number;
  peakElo: number;
  eloDelta: number;
  wins: number;
  ties: number;
  losses: number;
  winRate: number | null;
  played: number;
  currentStreak: number;
  longestStreak: number;
  sparklinePoints: number[];
}) {
  const {
    elo,
    peakElo,
    eloDelta,
    wins,
    ties,
    losses,
    winRate,
    played,
    currentStreak,
    longestStreak,
    sparklinePoints,
  } = props;

  return (
    <Section
      label="multiplayer"
      description="how you rank in mog battles."
      icon={Swords}
      accent="rose"
    >
      <Row
        label="elo"
        value={
          <span className="flex items-center gap-2">
            <span className="font-num text-lg font-semibold tabular-nums text-white">
              {elo}
            </span>
            <span className="font-num text-[12px] text-zinc-500 tabular-nums">
              peak {peakElo}
              {eloDelta < 0 && (
                <span className="ml-1 text-white/60">{eloDelta}</span>
              )}
            </span>
          </span>
        }
      />
      {sparklinePoints.length >= 2 && (
        <Row
          label="elo over time"
          value={
            <Sparkline
              points={sparklinePoints}
              width={140}
              height={32}
              stroke="rgba(255,255,255,0.85)"
              fill="rgba(255,255,255,0.10)"
            />
          }
        />
      )}
      <Row
        label="record"
        value={
          <span className="flex items-center gap-2">
            <span className="font-num text-[14px] font-semibold tabular-nums uppercase text-white">
              {ties > 0
                ? `${wins}W · ${ties}T · ${losses}L`
                : `${wins}W · ${losses}L`}
            </span>
            {winRate !== null && (
              <span className="font-num text-[12px] tabular-nums text-zinc-500">
                {winRate}% win rate
              </span>
            )}
          </span>
        }
      />
      <Row
        label="streak"
        value={
          <span className="flex items-center gap-2">
            <span className="font-num text-[14px] font-semibold tabular-nums text-white">
              {currentStreak}
            </span>
            <span className="font-num text-[12px] tabular-nums text-zinc-500">
              longest {longestStreak}
            </span>
          </span>
        }
      />
      <Row
        label="battles played"
        value={
          <span className="font-num text-[14px] font-semibold tabular-nums text-white">
            {played}
          </span>
        }
      />
    </Section>
  );
}

// ---- Recent battles strip ------------------------------------------------

function RecentBattlesSection({
  results,
}: {
  results: Array<'win' | 'loss' | 'tie'>;
}) {
  // Server returns newest-first; render oldest-left for natural reading.
  const ordered = [...results].reverse();
  const padded: Array<'win' | 'loss' | 'tie' | null> = [
    ...Array.from({ length: Math.max(0, 10 - ordered.length) }).map(
      () => null as null,
    ),
    ...ordered,
  ];
  return (
    <Section
      label="recent battles"
      description="last 10 results, newest on the right."
      icon={Activity}
      accent="emerald"
    >
      <div className="flex items-center gap-2 border-t border-white/5 px-4 py-4">
        <div className="flex flex-1 gap-1">
          {padded.map((r, i) => (
            <span
              key={i}
              aria-label={r === null ? 'no battle' : r}
              className={`h-3 flex-1 ${
                r === null
                  ? 'bg-white/[0.06]'
                  : r === 'win'
                    ? 'bg-white'
                    : r === 'tie'
                      ? 'bg-white/40'
                      : 'bg-white/15'
              }`}
              style={{ borderRadius: 1 }}
            />
          ))}
        </div>
        <span className="font-num text-[10px] tabular-nums text-zinc-500">
          new →
        </span>
      </div>
    </Section>
  );
}

// ---- Biggest swings ------------------------------------------------------

function BiggestSwingsSection({
  win,
  loss,
}: {
  win: SwingEntry | null;
  loss: SwingEntry | null;
}) {
  return (
    <Section
      label="biggest swings"
      description="your largest single-battle elo moves."
      icon={Zap}
      accent="amber"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <SwingCard kind="win" entry={win} />
        <SwingCard kind="loss" entry={loss} />
      </div>
    </Section>
  );
}

function SwingCard({
  kind,
  entry,
}: {
  kind: 'win' | 'loss';
  entry: SwingEntry | null;
}) {
  const isWin = kind === 'win';
  const Icon = isWin ? TrendingUp : TrendingDown;
  return (
    <div
      className={`flex flex-col gap-1.5 border-t border-white/5 px-4 py-4 sm:[&:nth-child(2)]:border-l ${
        isWin ? 'sm:[&]:border-l-0' : ''
      }`}
      style={{
        borderLeftColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
        <Icon size={11} aria-hidden /> {isWin ? 'BIGGEST WIN' : 'BIGGEST LOSS'}
      </div>
      {entry ? (
        <>
          <div className="font-num text-2xl font-bold tabular-nums text-white">
            {entry.delta > 0 ? `+${entry.delta}` : entry.delta} elo
          </div>
          <div className="text-[12px] text-zinc-400">
            {entry.opponent_display_name ? (
              <>
                vs{' '}
                <span className="text-zinc-200">{entry.opponent_display_name}</span>
              </>
            ) : (
              <span className="text-zinc-500">unknown opponent</span>
            )}
            {entry.finished_at && (
              <span className="ml-1 text-zinc-600">
                · {formatRelative(entry.finished_at)}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-[13px] text-zinc-500">no data yet</div>
      )}
    </div>
  );
}

// ---- Best scan -----------------------------------------------------------

function BestScanSection({
  overall,
  bestScan,
  leaderboardPhoto,
}: {
  overall: number | null;
  bestScan: { vision: VisionScore; scores: FinalScores } | null;
  leaderboardPhoto: string | null;
}) {
  if (overall === null || !bestScan) {
    return (
      <Section
        label="best scan"
        description="your top score and full breakdown."
        icon={Crown}
        accent="purple"
      >
        <p className="border-t border-white/5 px-4 py-4 text-[13px] text-zinc-500">
          no scan on record — scan once while signed in to populate this.
        </p>
      </Section>
    );
  }

  const tier = getTier(overall);
  const presentation =
    bestScan.scores.presentation ?? computePresentation(bestScan.vision);

  const subs: Array<[string, number]> = [
    ['jawline', bestScan.scores.sub?.jawline ?? 0],
    ['eyes', bestScan.scores.sub?.eyes ?? 0],
    ['skin', bestScan.scores.sub?.skin ?? 0],
    ['cheekbones', bestScan.scores.sub?.cheekbones ?? 0],
    ['presentation', presentation],
  ];

  return (
    <Section
      label="best scan"
      description="your top score and full breakdown."
      icon={Crown}
      accent="purple"
    >
      {leaderboardPhoto && (
        <div className="flex items-center gap-4 border-t border-white/5 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={leaderboardPhoto}
            alt=""
            className="h-16 w-16 flex-shrink-0 border-2 border-white/30 object-cover"
            style={{ borderRadius: 2 }}
          />
          <div className="flex flex-1 items-center gap-3">
            <span
              className="font-num text-3xl font-bold tabular-nums"
              style={{ color: getScoreColor(overall) }}
            >
              {overall}
            </span>
            <span
              className="font-num text-2xl font-bold uppercase"
              style={tierLetterStyle(tier)}
            >
              {tier.letter}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            <ImageIcon
              size={10}
              aria-hidden
              className="mr-1 inline-block text-zinc-600"
            />
            on board
          </span>
        </div>
      )}
      {!leaderboardPhoto && (
        <Row
          label="overall"
          value={
            <span className="flex items-center gap-2">
              <span
                className="font-num text-lg font-semibold tabular-nums"
                style={{ color: getScoreColor(overall) }}
              >
                {overall}
              </span>
              <span
                className="font-num text-base font-bold uppercase"
                style={tierLetterStyle(tier)}
              >
                {tier.letter}
              </span>
            </span>
          }
        />
      )}
      {subs.map(([name, value]) => (
        <Row
          key={name}
          label={name}
          value={
            <span className="flex items-center gap-2">
              <MetricBar value={value} />
              <span
                className="font-num w-8 text-right text-[13px] font-semibold tabular-nums"
                style={{ color: getScoreColor(value) }}
              >
                {Math.round(value)}
              </span>
            </span>
          }
        />
      ))}
      <div className="border-t border-white/5 px-4 py-3">
        <MoreDetail
          vision={bestScan.vision}
          presentation={presentation}
          signedIn
        />
      </div>
    </Section>
  );
}

function MetricBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = getScoreColor(value);
  return (
    <span
      aria-hidden
      className="relative h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </span>
  );
}

// ---- Tier distribution ---------------------------------------------------

function TierDistributionSection({ scans }: { scans: number[] }) {
  // Bucket each scan into one of TIER_BANDS by min threshold.
  const counts = TIER_BANDS.map((band) => ({ ...band, count: 0 }));
  for (const overall of scans) {
    for (const band of counts) {
      if (overall >= band.min) {
        band.count += 1;
        break;
      }
    }
  }
  const max = Math.max(1, ...counts.map((c) => c.count));
  const total = scans.length;

  return (
    <Section
      label="tier distribution"
      description={`${total} scan${total === 1 ? '' : 's'} grouped by tier.`}
      icon={LineChart}
      accent="cyan"
    >
      {counts.map((c) => {
        const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
        const w = max > 0 ? (c.count / max) * 100 : 0;
        const tier = getTier(c.min);
        return (
          <div
            key={c.letter}
            className="flex items-center gap-3 border-t border-white/5 px-4 py-2.5"
          >
            <span
              className="font-num w-7 text-base font-bold uppercase"
              style={tierLetterStyle(tier)}
            >
              {c.letter}
            </span>
            <span
              aria-hidden
              className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${w}%`,
                  background:
                    'linear-gradient(90deg, rgba(34,211,238,0.45) 0%, rgba(34,211,238,0.85) 100%)',
                }}
              />
            </span>
            <span className="font-num w-12 text-right text-[12px] tabular-nums text-zinc-300">
              {c.count}
            </span>
            <span className="font-num w-10 text-right text-[11px] tabular-nums text-zinc-500">
              {pct}%
            </span>
          </div>
        );
      })}
    </Section>
  );
}

// ---- Weakness frequency --------------------------------------------------

function WeaknessSection({ counts }: { counts: Record<string, number> }) {
  const max = Math.max(0, ...IMPROVEMENT_KEYS.map((k) => counts?.[k] ?? 0));
  const total = IMPROVEMENT_KEYS.reduce((a, k) => a + (counts?.[k] ?? 0), 0);

  return (
    <Section
      label="weakness frequency"
      description={`${total} weakness call${total === 1 ? '' : 's'} from your battles.`}
      icon={Trophy}
      accent="violet"
    >
      {total === 0 ? (
        <p className="border-t border-white/5 px-4 py-4 text-[13px] text-zinc-500">
          populated as you battle — no calls yet.
        </p>
      ) : (
        IMPROVEMENT_KEYS.map((key) => {
          const count = counts?.[key] ?? 0;
          const pct = max > 0 ? (count / max) * 100 : 0;
          const isTop = max > 0 && count === max;
          return (
            <div
              key={key}
              className="flex items-center gap-3 border-t border-white/5 px-4 py-2.5"
            >
              <span className="w-24 text-[13px] text-zinc-300">{key}</span>
              <span
                aria-hidden
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isTop
                      ? '#a855f7'
                      : 'rgba(255,255,255,0.45)',
                  }}
                />
              </span>
              <span
                className={`font-num w-8 text-right text-[13px] font-semibold tabular-nums ${
                  isTop ? 'text-white' : 'text-white/50'
                }`}
              >
                {count}
              </span>
            </div>
          );
        })
      )}
    </Section>
  );
}

// ---- Most-improved -------------------------------------------------------

function MostImprovedSection({
  most,
}: {
  most: { metric: string; delta: number };
}) {
  return (
    <Section
      label="most improved"
      description="biggest gain from your earliest scans to recent ones."
      icon={Sparkles}
      accent="emerald"
    >
      <div className="flex items-center gap-3 border-t border-white/15 px-4 py-4">
        <Sparkles size={18} className="text-white" aria-hidden />
        <span className="text-[14px] text-white">
          your <span className="font-semibold">{most.metric}</span> score is up{' '}
          <span className="font-num font-semibold tabular-nums text-white">
            +{most.delta} pts
          </span>
        </span>
      </div>
    </Section>
  );
}

// ---- Row primitive -------------------------------------------------------

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/5 px-4 py-3">
      <span className="text-[12px] text-zinc-400">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] text-zinc-100">
        {value}
      </span>
    </div>
  );
}

// ---- Helpers -------------------------------------------------------------

function tierLetterStyle(tier: ReturnType<typeof getTier>): React.CSSProperties {
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

function formatAgeDays(days: number): string {
  if (days <= 0) return 'just joined';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
