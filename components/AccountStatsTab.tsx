'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { getTier, getTierDescriptor } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { computePresentation } from '@/lib/scoreEngine';
import { MoreDetail } from './MoreDetail';
import type { FinalScores, VisionScore } from '@/types';

type Profile = {
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  best_scan: { vision: VisionScore; scores: FinalScores } | null;
  improvement_counts: Record<string, number>;
};

type AccountResponse = { profile: Profile | null };

const IMPROVEMENT_KEYS = [
  'jawline',
  'eyes',
  'skin',
  'cheekbones',
  'nose',
  'hair',
] as const;

export function AccountStatsTab() {
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as AccountResponse;
        if (cancelled) return;
        setProfile(data.profile);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return <p className="text-sm text-zinc-500">not signed in</p>;
  if (!loaded) return <p className="text-sm text-zinc-500">loading…</p>;
  if (!profile) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-400">
        could not load profile
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <IdentityHero profile={profile} />
      <BestScanHero
        overall={profile.best_scan_overall}
        bestScan={profile.best_scan}
      />
      <MultiplayerOverview profile={profile} />
      <ImprovementChart counts={profile.improvement_counts} />
    </div>
  );
}

// ---- Identity hero ---------------------------------------------------------

function IdentityHero({ profile }: { profile: Profile }) {
  const tier = profile.best_scan_overall !== null
    ? getTier(profile.best_scan_overall)
    : null;
  const descriptor = tier ? getTierDescriptor(tier.letter) : null;

  return (
    <FadeIn delay={0}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6">
        <BackgroundGlass color="rgba(168,85,247,0.55)" />
        <div className="relative flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
            you
          </div>
          <h2 className="text-3xl font-bold leading-tight text-white">
            {profile.display_name}
          </h2>
          {descriptor && (
            <div className="mt-1 text-sm text-white/65">
              <span className="font-semibold">{descriptor}</span>
              {tier && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  tier
                  <span
                    className="font-num font-extrabold normal-case"
                    style={tierLetterStyle(tier)}
                  >
                    {tier.letter}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </section>
    </FadeIn>
  );
}

// ---- Best scan hero --------------------------------------------------------

function BestScanHero({
  overall,
  bestScan,
}: {
  overall: number | null;
  bestScan: { vision: VisionScore; scores: FinalScores } | null;
}) {
  if (overall === null || !bestScan) return <NoBestScanCard />;

  const tier = getTier(overall);
  const color = getScoreColor(overall);
  const descriptor = getTierDescriptor(tier.letter);
  const presentation =
    bestScan.scores.presentation ?? computePresentation(bestScan.vision);

  // Five composite bars in fixed display order, sized 0..100.
  const composites: Array<{ label: string; value: number }> = [
    { label: 'jawline', value: bestScan.scores.sub?.jawline ?? 0 },
    { label: 'eyes', value: bestScan.scores.sub?.eyes ?? 0 },
    { label: 'skin', value: bestScan.scores.sub?.skin ?? 0 },
    { label: 'cheekbones', value: bestScan.scores.sub?.cheekbones ?? 0 },
    { label: 'presentation', value: presentation },
  ];

  return (
    <FadeIn delay={0.05}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6">
        <BackgroundGlass
          color={tier.isGradient ? 'rgba(168,85,247,0.65)' : `${color}aa`}
        />

        <div className="relative flex flex-col gap-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
            best scan
          </div>

          {/* Score row: tier letter, number, descriptor */}
          <div className="flex items-end gap-4">
            <span
              className="font-num text-7xl font-extrabold leading-none tabular-nums"
              style={tierLetterStyle(tier)}
            >
              {tier.letter}
            </span>
            <div className="flex flex-col">
              <span
                className="font-num text-5xl font-extrabold leading-none tabular-nums"
                style={{ color, textShadow: `0 0 28px ${color}55` }}
              >
                {overall}
              </span>
              <span className="mt-1 text-sm text-white/65">{descriptor}</span>
            </div>
          </div>

          {/* Composite bars */}
          <div className="flex flex-col gap-2">
            {composites.map((c) => (
              <CompositeBar key={c.label} label={c.label} value={c.value} />
            ))}
          </div>

          {/* All-30 detail collapsible */}
          <MoreDetail vision={bestScan.vision} presentation={presentation} />
        </div>
      </section>
    </FadeIn>
  );
}

function CompositeBar({ label, value }: { label: string; value: number }) {
  const color = getScoreColor(value);
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 flex-shrink-0 text-[11px] uppercase tracking-[0.16em] text-white/55">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 14px ${color}66` }}
        />
      </div>
      <span
        className="font-num w-10 text-right text-sm font-bold tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function NoBestScanCard() {
  return (
    <FadeIn delay={0.05}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-8 text-center">
        <BackgroundGlass color="rgba(255,255,255,0.18)" />
        <div className="relative flex flex-col items-center gap-2">
          <div className="text-3xl">📸</div>
          <p className="text-sm text-white">no scan on record</p>
          <p className="text-xs leading-relaxed text-white/55">
            scan once while signed in and your best result lands here with the full
            30-field breakdown.
          </p>
        </div>
      </section>
    </FadeIn>
  );
}

// ---- Multiplayer overview --------------------------------------------------

function MultiplayerOverview({ profile }: { profile: Profile }) {
  const losses = profile.matches_played - profile.matches_won;
  const winRate =
    profile.matches_played > 0
      ? Math.round((profile.matches_won / profile.matches_played) * 100)
      : null;
  const eloDelta = profile.elo - profile.peak_elo;

  return (
    <FadeIn delay={0.1}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6">
        <BackgroundGlass color="rgba(34,211,238,0.45)" />

        <div className="relative flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
              multiplayer
            </h3>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
              {profile.matches_played} battle
              {profile.matches_played === 1 ? '' : 's'}
            </div>
          </div>

          {/* Big ELO display */}
          <div className="flex items-end gap-3">
            <span className="font-num text-6xl font-extrabold leading-none tabular-nums text-white">
              {profile.elo}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                ELO
              </span>
              <span className="text-[11px] text-white/55">
                peak <span className="font-semibold">{profile.peak_elo}</span>
                {eloDelta < 0 && (
                  <span className="ml-1 text-amber-300/80">{eloDelta}</span>
                )}
              </span>
            </div>
          </div>

          {/* 3-cell stat row */}
          <div className="grid grid-cols-3 gap-2">
            <StatCell
              label="record"
              value={`${profile.matches_won}–${losses}`}
              sub={
                winRate !== null
                  ? `${winRate}% wr`
                  : profile.matches_played === 0
                    ? 'unranked'
                    : null
              }
            />
            <StatCell
              label="streak"
              value={profile.current_streak.toString()}
              sub={`peak ${profile.longest_streak}`}
              accent={profile.current_streak >= 3 ? '#10b981' : undefined}
            />
            <StatCell
              label="win rate"
              value={winRate !== null ? `${winRate}%` : '—'}
              sub={
                winRate !== null
                  ? winRate >= 60
                    ? 'mogger'
                    : winRate >= 40
                      ? 'fair'
                      : 'rough'
                  : null
              }
              accent={
                winRate !== null
                  ? winRate >= 60
                    ? '#10b981'
                    : winRate >= 40
                      ? '#f59e0b'
                      : '#ef4444'
                  : undefined
              }
            />
          </div>
        </div>
      </section>
    </FadeIn>
  );
}

function StatCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string | null;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div
        className="font-num text-xl font-extrabold tabular-nums leading-none"
        style={{ color: accent ?? '#ffffff' }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-white/45">{sub}</div>}
    </div>
  );
}

// ---- Improvement chart -----------------------------------------------------

function ImprovementChart({ counts }: { counts: Record<string, number> }) {
  const rows = useMemo(() => {
    const max = Math.max(
      0,
      ...IMPROVEMENT_KEYS.map((k) => Number(counts?.[k] ?? 0)),
    );
    return IMPROVEMENT_KEYS.map((label) => {
      const count = Number(counts?.[label] ?? 0);
      return {
        label,
        count,
        pct: max > 0 ? (count / max) * 100 : 0,
        isTop: max > 0 && count === max,
      };
    });
  }, [counts]);

  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <FadeIn delay={0.15}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6">
        <BackgroundGlass color="rgba(245,158,11,0.45)" />

        <div className="relative flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
              most-called weaknesses
            </h3>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
              {total} call{total === 1 ? '' : 's'}
            </div>
          </div>

          {total === 0 ? (
            <p className="text-xs leading-relaxed text-white/55">
              what the model thinks needs the most work — populated as you battle.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span
                    className={`w-24 flex-shrink-0 text-[11px] uppercase tracking-[0.16em] ${
                      r.isTop ? 'text-amber-300' : 'text-white/55'
                    }`}
                  >
                    {r.label}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${r.pct}%` }}
                      transition={{
                        duration: 0.8,
                        ease: [0.22, 1, 0.36, 1],
                        delay: 0.2,
                      }}
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        backgroundColor: r.isTop ? '#f59e0b' : 'rgba(255,255,255,0.55)',
                        boxShadow: r.isTop ? '0 0 14px #f59e0b66' : undefined,
                      }}
                    />
                  </div>
                  <span
                    className={`font-num w-8 text-right text-sm font-bold tabular-nums ${
                      r.isTop ? 'text-amber-300' : 'text-white/70'
                    }`}
                  >
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </FadeIn>
  );
}

// ---- Shared visuals --------------------------------------------------------

function BackgroundGlass({ color }: { color: string }) {
  // Same dark+frosted+single-radial treatment as the home cards.
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: '#0a0a0a' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-2xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 35%)',
        }}
      />
    </>
  );
}

function FadeIn({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function tierLetterStyle(tier: ReturnType<typeof getTier>): React.CSSProperties {
  if (tier.isGradient) {
    return {
      backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textShadow: tier.glow ? '0 0 30px rgba(168,85,247,0.55)' : undefined,
    };
  }
  return { color: tier.color };
}
