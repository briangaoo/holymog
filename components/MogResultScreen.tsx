'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Download, Flag, Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { NameFx } from '@/components/customization/NameFx';
import { BattleReportModal } from '@/components/BattleReportModal';
import type { UserStats } from '@/lib/customization';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { generateBattleShareImage } from '@/lib/battleShareImageGenerator';
import type { SubScores } from '@/types';

/**
 * End-of-battle screen — shared across the private-party flow (/mog)
 * and the public-matchmaking flow (/mog/battle). Both used to inline
 * their own copy of this screen, which drifted (public still rendered
 * the small "you mogged" + two tiny cells layout long after the
 * private flow got the dramatic rewrite). One component, one place to
 * update.
 *
 * Props:
 *   - result: FinishPayload broadcast by /api/battle/finish
 *   - currentUserId: which participant is "you"
 *   - onFindAnother: parent navigates to a fresh matchmaking session
 *     (public) or back to mode-select (private)
 *   - onRematch: optional, private only. The component handles the
 *     POST /api/battle/rematch + dispatches this with the new id/code
 *     once the server creates the rematch battle. Public callers
 *     omit this and the rematch button is replaced by find-another.
 *   - onRematchInvite: optional, private only. Fires when the OTHER
 *     player clicks rematch first and the server broadcasts
 *     battle.rematch on this battle's channel.
 */
export type FinishPayload = {
  battle_id: string;
  kind?: 'public' | 'private';
  winner_id: string | null;
  is_tie?: boolean;
  participants: Array<{
    user_id: string;
    display_name: string;
    final_score: number;
    is_winner: boolean;
    is_tie?: boolean;
    /** Cosmetic + userStats fields the server enriches per participant
     *  so the result screen can render @opponent with their actual
     *  equipped name effect (including smart fx that need live stats —
     *  tier-prefix, streak-flame, elo-king, callout, score-overlay).
     *  All optional so older runtime payloads (BattleRoom's local type
     *  trims them) flow through and degrade to plain text. */
    equipped_name_fx?: string | null;
    elo?: number | null;
    current_streak?: number | null;
    matches_won?: number | null;
    best_scan_overall?: number | null;
    weakest_sub_score?: keyof SubScores | null;
    is_subscriber?: boolean;
  }>;
  elo_changes?: Array<{
    user_id: string;
    before: number;
    after: number;
    delta: number;
  }>;
};

/** Build a UserStats from an enriched FinishPayload participant. Used
 *  by every <NameFx> render site on the result screen so smart name
 *  fx mirror what the user looks like everywhere else in the app. */
function participantUserStats(
  p: FinishPayload['participants'][number],
): UserStats {
  return {
    elo: p.elo ?? null,
    bestScanOverall: p.best_scan_overall ?? null,
    currentStreak: p.current_streak ?? null,
    currentWinStreak: p.current_streak ?? null,
    matchesWon: p.matches_won ?? null,
    weakestSubScore: p.weakest_sub_score ?? null,
  };
}

export function MogResultScreen({
  result,
  currentUserId,
  onFindAnother,
  onRematch,
  onRematchInvite,
}: {
  result: FinishPayload;
  currentUserId: string;
  onFindAnother: () => void;
  onRematch?: (battleId: string, code: string, isHost: boolean) => void;
  onRematchInvite?: (battleId: string, code: string) => void;
}) {
  const me = result.participants.find((p) => p.user_id === currentUserId);
  const opponent = result.participants.find((p) => p.user_id !== currentUserId);
  const isTie = result.is_tie === true || result.winner_id === null;
  const youWon = !isTie && me?.is_winner === true;
  const isPrivate = result.kind === 'private';
  // Report flow lives in public-1v1 only. The button shows in the
  // result actions; the modal mounts at the page root via portal.
  const isPublic = result.kind === 'public';
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!isPrivate) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`battle:${result.battle_id}`)
      .on(
        'broadcast',
        { event: 'battle.rematch' },
        (msg: {
          payload: { new_battle_id?: string; new_code?: string };
        }) => {
          const id = msg.payload.new_battle_id;
          const code = msg.payload.new_code;
          if (typeof id === 'string' && typeof code === 'string') {
            if (onRematchInvite) onRematchInvite(id, code);
            else if (onRematch) onRematch(id, code, false);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isPrivate, result.battle_id, onRematch, onRematchInvite]);

  const onShare = useCallback(async () => {
    if (!me || !opponent) return;
    setSharing(true);
    try {
      // Pull this user's ELO change so the share card can render the
      // same "+24 ELO · now 1547" pill the result screen shows. Only
      // populated on public 1v1 matches — private battles ship without
      // it and the generator hides the pill.
      const myEloChange = (result.elo_changes ?? []).find(
        (c) => c.user_id === currentUserId,
      );
      const blob = await generateBattleShareImage({
        self: {
          display_name: me.display_name,
          peak_score: me.final_score,
          elo_delta: myEloChange?.delta,
          elo_after: myEloChange?.after,
        },
        opponent: {
          display_name: opponent.display_name,
          peak_score: opponent.final_score,
        },
        won: youWon,
        tied: isTie,
      });
      const filename = `holymog-${isTie ? 'tie' : youWon ? 'win' : 'loss'}-${Date.now()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      const navWithShare = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (
        typeof navWithShare.canShare === 'function' &&
        typeof navWithShare.share === 'function' &&
        navWithShare.canShare({ files: [file] })
      ) {
        await navWithShare.share({
          files: [file],
          title: 'holymog battle',
          text: isTie ? 'we tied' : youWon ? 'i mogged' : 'i got mogged',
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // best-effort
    } finally {
      setSharing(false);
    }
  }, [me, opponent, youWon, isTie, result.elo_changes, currentUserId]);

  const startRematch = useCallback(async () => {
    if (!onRematch) return;
    setRematching(true);
    setRematchError(null);
    try {
      const res = await fetch('/api/battle/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle_id: result.battle_id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRematchError(data.error ?? 'rematch failed');
        setRematching(false);
        return;
      }
      const data = (await res.json()) as { battle_id: string; code: string };
      onRematch(data.battle_id, data.code, true);
    } catch {
      setRematchError('network error');
      setRematching(false);
    }
  }, [result.battle_id, onRematch]);

  if (!me || !opponent) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/mog" />
        <main className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-5 py-8 text-center text-sm text-zinc-400">
          battle complete · thanks for spectating
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      <ResultAmbient won={youWon} tied={isTie} myScore={me.final_score} />
      {youWon && <ResultConfetti />}
      {!youWon && !isTie && <ResultLossWash />}

      <AppHeader authNext="/mog" />

      <main
        className="relative z-10 mx-auto w-full max-w-4xl px-5 pt-2 pb-12 sm:pt-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
        <ResultHeadline
          won={youWon}
          tied={isTie}
          myScore={me.final_score}
          opponent={opponent}
        />

        <ResultVersusBoard
          me={me}
          opponent={opponent}
          youWon={youWon}
          tied={isTie}
        />

        <ResultDelta me={me} opponent={opponent} youWon={youWon} tied={isTie} />

        <ResultEloDelta
          changes={result.elo_changes ?? []}
          currentUserId={currentUserId}
          tied={isTie}
        />

        <ResultActions
          isPrivate={isPrivate && !!onRematch}
          rematching={rematching}
          sharing={sharing}
          rematchError={rematchError}
          onShare={onShare}
          onRematch={startRematch}
          onFindAnother={onFindAnother}
        />

        {/* Report row — public 1v1 only. Subtle outlined button below
            the main actions so it's available without competing for
            attention with share/rematch/find-another. The modal
            handles all submit-state UX. */}
        {isPublic && (
          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1.5 border border-white/20 bg-black px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 transition-colors hover:border-white hover:bg-white/[0.04] hover:text-white"
              style={{ borderRadius: 2 }}
            >
              <Flag size={11} aria-hidden />
              report @{opponent.display_name}
            </button>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-zinc-600">
          <Link
            href={`/@${me.display_name}`}
            className="hover:text-zinc-400 hover:underline underline-offset-2"
          >
            @{me.display_name}
          </Link>
          <span aria-hidden>·</span>
          <Link
            href={`/@${opponent.display_name}`}
            className="hover:text-zinc-400 hover:underline underline-offset-2"
          >
            @{opponent.display_name}
          </Link>
        </div>
      </main>

      {/* Report modal (public-1v1 only). Mounted at the page root
          via portal so it isn't clipped by the result screen's
          transformed parents. */}
      {isPublic && (
        <BattleReportModal
          open={reportOpen}
          battleId={result.battle_id}
          reportedUserId={opponent.user_id}
          reportedDisplayName={opponent.display_name}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------ Helpers (count-up + tier styling) ------------------------ */

function useCountUp(target: number, durationMs = 1100, delay = 200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    let timeoutId = 0;
    const start = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(target * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    timeoutId = window.setTimeout(start, delay);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    };
  }, [target, durationMs, delay]);
  return value;
}

function tierTextStyle(score: number): React.CSSProperties {
  // Defense-in-depth alongside the `uppercase` class on each render
  // site — body globally lowercases everything, so tier letters need
  // an explicit override here too.
  const tier = getTier(score);
  return tier.isGradient
    ? {
        backgroundImage: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textTransform: 'uppercase',
      }
    : { color: tier.color, textTransform: 'uppercase' };
}

/* ------------ Presentational pieces ----------------------------------- */

function ResultAmbient({
  won,
  tied,
  myScore,
}: {
  won: boolean;
  tied: boolean;
  myScore: number;
}) {
  // Brutalist: ambient glow blobs muted across all states. Win still
  // pulls the tier colour (the single brand exception); tied + loss
  // collapse to monochrome.
  const accent = tied
    ? 'rgba(255,255,255,0.18)'
    : won
      ? getScoreColor(myScore)
      : 'rgba(255,255,255,0.10)';
  return (
    <>
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.5, scale: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="pointer-events-none absolute -right-40 -top-40 h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${accent} 0%, rgba(0,0,0,0) 65%)`,
        }}
      />
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.35, scale: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1 }}
        className="pointer-events-none absolute -left-40 bottom-1/3 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background: tied
            ? 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)'
            : won
              ? 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
        }}
      />
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 1.6, ease: 'easeOut', delay: 0.3 }}
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
        }}
      />
    </>
  );
}

function ResultLossWash() {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2 }}
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        background:
          'radial-gradient(ellipse at center top, rgba(40,40,52,0.25) 0%, rgba(0,0,0,0) 60%)',
      }}
    />
  );
}

function ResultConfetti() {
  const particles = useMemo(() => {
    const colors = ['#22d3ee', '#a855f7', '#fbbf24', '#10b981', '#f43f5e', '#ffffff'];
    return Array.from({ length: 36 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.6 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 80,
      rotate: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)] as string,
      size: 6 + Math.random() * 6,
    }));
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: '110vh',
            x: p.drift,
            opacity: [0, 1, 1, 0],
            rotate: p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

function ResultHeadline({
  won,
  tied,
  myScore,
  opponent,
}: {
  won: boolean;
  tied: boolean;
  myScore: number;
  opponent: FinishPayload['participants'][number];
}) {
  // Headline is the only ALLCAPS bit — the subhead below is sentence-
  // case so the opponent's @handle reads naturally and any equipped
  // name fx (handwritten signature, gradient text, etc.) doesn't get
  // butchered by an uppercase transform.
  const headline = tied ? 'TIED' : won ? 'YOU MOGGED' : 'GOT MOGGED';
  // Brutalist: only the WIN headline retains tier colour (brand exception);
  // tie + loss collapse to pure white / muted white so colour reads as
  // celebration, not coding for win/loss state.
  const headlineColor = tied ? '#ffffff' : won ? getScoreColor(myScore) : '#ffffff';
  const subColor = tied
    ? 'text-white/60'
    : won
      ? 'text-white'
      : 'text-white/60';

  // Wrap the opponent's @handle in <NameFx> so their equipped name
  // treatment shows everywhere their name appears — same posture as
  // the leaderboard rows, battle tiles, and profile pages.
  const opponentTag = (
    <NameFx
      slug={opponent.equipped_name_fx ?? null}
      userStats={participantUserStats(opponent)}
    >
      @{opponent.display_name}
    </NameFx>
  );
  const subContent = tied ? (
    <>you and {opponentTag} tied.</>
  ) : won ? (
    <>you cooked {opponentTag}.</>
  ) : (
    <>{opponentTag} cooked you.</>
  );

  return (
    <div className="mb-10 text-center sm:mb-14">
      <motion.h1
        initial={{ y: 30, opacity: 0, letterSpacing: '0.12em' }}
        animate={{ y: 0, opacity: 1, letterSpacing: '-0.04em' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-6xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl md:text-[120px]"
        style={{
          color: headlineColor,
          textShadow: tied
            ? '0 0 48px rgba(255,255,255,0.25), 0 4px 24px rgba(0,0,0,0.6)'
            : won
              ? `0 0 64px ${headlineColor}55, 0 0 32px ${headlineColor}40, 0 4px 24px rgba(0,0,0,0.6)`
              : '0 0 48px rgba(255,255,255,0.20), 0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        {headline}
      </motion.h1>
      <motion.p
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        className={`mt-3 text-base font-medium normal-case sm:mt-4 sm:text-lg ${subColor}`}
      >
        {subContent}
      </motion.p>
    </div>
  );
}

function ResultEloDelta({
  changes,
  currentUserId,
  tied,
}: {
  changes: NonNullable<FinishPayload['elo_changes']>;
  currentUserId: string;
  tied: boolean;
}) {
  const mine = changes.find((c) => c.user_id === currentUserId);
  if (!mine) return null;
  const positive = mine.delta > 0;
  const neutral = mine.delta === 0;
  const color = tied
    ? '#d4d4d8'
    : positive
      ? '#34d399'
      : neutral
        ? '#a1a1aa'
        : '#fb7185';
  const sign = positive ? '+' : mine.delta < 0 ? '−' : '±';
  return (
    <motion.div
      initial={{ y: 12, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, delay: 0.7 }}
      className="mx-auto mb-8 inline-flex w-full max-w-sm items-center justify-center gap-3 rounded-full border px-5 py-3"
      style={{
        borderColor: `${color}55`,
        background: `linear-gradient(135deg, ${color}1a 0%, transparent 100%)`,
        boxShadow: `0 0 32px -10px ${color}66`,
      }}
    >
      <span
        className="font-num text-2xl font-black tabular-nums"
        style={{ color }}
      >
        {sign}
        {Math.abs(mine.delta)}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
        elo
      </span>
      <span className="text-zinc-600">·</span>
      <span
        className="font-num text-base font-bold tabular-nums text-white"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        now {mine.after}
      </span>
    </motion.div>
  );
}

function ResultVersusBoard({
  me,
  opponent,
  youWon,
  tied,
}: {
  me: FinishPayload['participants'][number];
  opponent: FinishPayload['participants'][number];
  youWon: boolean;
  tied: boolean;
}) {
  return (
    <div className="mb-8 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-5">
      <ResultPlayer
        entry={me}
        won={!tied && youWon}
        tied={tied}
        side="left"
        label="you"
      />
      <ResultVsDivider winnerOnLeft={youWon} tied={tied} />
      <ResultPlayer
        entry={opponent}
        won={!tied && !youWon}
        tied={tied}
        side="right"
        label="opponent"
      />
    </div>
  );
}

function ResultVsDivider({
  winnerOnLeft,
  tied,
}: {
  winnerOnLeft: boolean;
  tied: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center px-1 sm:px-2">
      <motion.span
        initial={{ rotate: -180, scale: 0.4, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`text-3xl font-black italic sm:text-5xl ${
          tied ? 'text-zinc-600' : 'text-zinc-500'
        }`}
        style={{ textShadow: '0 0 20px rgba(255,255,255,0.08)' }}
      >
        {tied ? '=' : 'vs'}
      </motion.span>
      <motion.span
        aria-hidden
        initial={{ height: 0 }}
        animate={{ height: '40%' }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-white/20 to-transparent"
        style={{
          transform: winnerOnLeft
            ? 'translateX(-60%) skewX(-8deg)'
            : 'translateX(-40%) skewX(8deg)',
        }}
      />
      <motion.span
        aria-hidden
        initial={{ height: 0 }}
        animate={{ height: '40%' }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="absolute bottom-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-t from-white/20 to-transparent"
      />
    </div>
  );
}

function ResultPlayer({
  entry,
  won,
  tied,
  side,
  label,
}: {
  entry: FinishPayload['participants'][number];
  won: boolean;
  tied: boolean;
  side: 'left' | 'right';
  label: string;
}) {
  const animatedScore = useCountUp(entry.final_score, 1200, side === 'left' ? 250 : 400);
  const tier = getTier(entry.final_score);
  const color = getScoreColor(entry.final_score);
  const ZINC = '#a1a1aa';
  const cardColor = tied ? ZINC : color;
  return (
    <motion.div
      initial={{ x: side === 'left' ? -40 : 40, opacity: 0, scale: 0.94 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      transition={{
        duration: 0.6,
        delay: side === 'left' ? 0.2 : 0.32,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`relative flex flex-col gap-3 overflow-hidden border-2 px-5 py-6 transition-shadow ${
        won
          ? 'border-white bg-white/[0.04]'
          : tied
            ? 'border-white/30 bg-white/[0.02]'
            : 'border-white/20 bg-black'
      }`}
      style={{
        borderRadius: 2,
        boxShadow: won ? `0 0 48px -12px ${color}55, inset 0 0 0 1px ${color}33` : undefined,
      }}
    >
      {won && (
        <motion.span
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.4, delay: 0.7, type: 'spring', stiffness: 280 }}
          className="absolute right-3 top-3 inline-flex items-center gap-1 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-black"
          style={{ borderRadius: 2 }}
        >
          ✦ WINNER
        </motion.span>
      )}
      {tied && (
        <motion.span
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.4, delay: 0.7, type: 'spring', stiffness: 280 }}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-zinc-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200"
        >
          = tied
        </motion.span>
      )}
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>

      <div className="flex items-baseline gap-2">
        <span
          className="font-num text-7xl font-black leading-none tabular-nums sm:text-8xl"
          style={{
            color: cardColor,
            textShadow: `0 0 32px ${cardColor}55, 0 2px 6px rgba(0,0,0,0.5)`,
          }}
        >
          {animatedScore}
        </span>
        <span
          className="font-num text-3xl font-black uppercase sm:text-4xl"
          style={tied ? { color: ZINC } : tierTextStyle(entry.final_score)}
        >
          {tier.letter}
        </span>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${entry.final_score}%` }}
          transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ background: cardColor }}
        />
      </div>

      <span className="truncate text-sm font-medium text-white">
        <NameFx
          slug={entry.equipped_name_fx ?? null}
          userStats={participantUserStats(entry)}
        >
          @{entry.display_name}
        </NameFx>
      </span>
    </motion.div>
  );
}

function ResultDelta({
  me,
  opponent,
  youWon,
  tied,
}: {
  me: FinishPayload['participants'][number];
  opponent: FinishPayload['participants'][number];
  youWon: boolean;
  tied: boolean;
}) {
  const delta = Math.abs(me.final_score - opponent.final_score);
  const margin = tied
    ? 'dead even'
    : delta >= 25
      ? 'utter mog'
      : delta >= 12
        ? 'clear win'
        : delta >= 5
          ? 'comfortable'
          : delta >= 1
            ? 'photo finish'
            : 'dead even';
  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="mb-8 flex items-center justify-center gap-3 text-[12px]"
    >
      <span className="text-zinc-500 uppercase tracking-[0.18em]">margin</span>
      <span
        className={`font-num text-base font-bold tabular-nums ${
          tied
            ? 'text-white/70'
            : youWon
              ? 'text-white'
              : 'text-white/50'
        }`}
      >
        {tied ? '±0' : (youWon ? '+' : '−') + delta}
      </span>
      <span className="text-zinc-500 uppercase tracking-[0.18em]">·</span>
      <span className="text-[12px] font-medium uppercase tracking-[0.16em] text-zinc-300">
        {margin}
      </span>
    </motion.div>
  );
}

function ResultActions({
  isPrivate,
  rematching,
  sharing,
  rematchError,
  onShare,
  onRematch,
  onFindAnother,
}: {
  isPrivate: boolean;
  rematching: boolean;
  sharing: boolean;
  rematchError: string | null;
  onShare: () => void;
  onRematch: () => void;
  onFindAnother: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.75 }}
      className="flex flex-col gap-2"
    >
      {rematchError && (
        <p className="text-center text-xs text-red-300">{rematchError}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onShare}
          disabled={sharing}
          style={{ touchAction: 'manipulation' }}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sharing ? (
            <>
              <Loader2 size={14} className="animate-spin" /> rendering…
            </>
          ) : (
            <>
              <Download size={14} aria-hidden /> share
            </>
          )}
        </button>
        {isPrivate ? (
          <button
            type="button"
            onClick={onRematch}
            disabled={rematching}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-12 flex-[1.2] items-center justify-center gap-2 rounded-full bg-white text-sm font-bold uppercase tracking-[0.14em] text-black transition-all hover:bg-zinc-100 hover:shadow-[0_8px_32px_-8px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rematching ? (
              <>
                <Loader2 size={14} className="animate-spin" /> rematching…
              </>
            ) : (
              <>rematch</>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onFindAnother}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-12 flex-[1.2] items-center justify-center gap-2 rounded-full bg-white text-sm font-bold uppercase tracking-[0.14em] text-black transition-all hover:bg-zinc-100 hover:shadow-[0_8px_32px_-8px_rgba(255,255,255,0.4)]"
          >
            find another
          </button>
        )}
        <Link
          href="/"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm font-medium text-white backdrop-blur-sm hover:bg-white/[0.08]"
        >
          home
        </Link>
      </div>
    </motion.div>
  );
}
