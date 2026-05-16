'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Crown, Download, Flag, Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { NameFx } from '@/components/customization/NameFx';
import { Frame } from '@/components/customization/Frame';
import { Badge } from '@/components/customization/Badge';
import { AvatarFallback } from '@/components/AvatarFallback';
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
    /** Profile picture URL + cosmetic slugs the server enriches per
     *  participant so the result screen renders avatars + frames +
     *  badges + name fx that match what these users look like on
     *  every other surface in the product. All optional so older
     *  runtime payloads (BattleRoom's local type trims them) flow
     *  through and degrade to plain text + fallback avatar. */
    avatar_url?: string | null;
    equipped_frame?: string | null;
    equipped_flair?: string | null;
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

  // Party finish (3+ participants) gets a podium layout instead of
  // the 1v1 versus board. Sort by final_score desc — ties preserve
  // the server-side joined_at order. myRank is 1-indexed; we use it
  // for the headline copy ("podium finish" / "honorable mention" /
  // "you got mogged") and for "is YOU in the top 3" so confetti only
  // fires when there's something to celebrate from YOUR perspective.
  const sortedParticipants = [...result.participants].sort(
    (a, b) => b.final_score - a.final_score,
  );
  const isParty = sortedParticipants.length >= 3;
  const myRank = me
    ? sortedParticipants.findIndex((p) => p.user_id === me.user_id) + 1
    : 0;
  const youInTopThree = myRank >= 1 && myRank <= 3;
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
          payload: {
            new_battle_id?: string;
            new_code?: string;
            host_user_id?: string | null;
          };
        }) => {
          const id = msg.payload.new_battle_id;
          const code = msg.payload.new_code;
          if (typeof id === 'string' && typeof code === 'string') {
            // host_user_id rides on the broadcast (rematch route adds
            // it). Receiver is the host iff their currentUserId
            // matches. Without this, the receiver's UI would always
            // show "WAITING FOR HOST" even when they ARE the host
            // (because the broadcast-arrival path used to hardcode
            // isHost=false).
            const isHost = currentUserId === msg.payload.host_user_id;
            if (onRematchInvite) onRematchInvite(id, code);
            else if (onRematch) onRematch(id, code, isHost);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isPrivate, result.battle_id, onRematch, onRematchInvite, currentUserId]);

  // Polling fallback — Realtime broadcasts have been flaky on this
  // project, and the rematch race is the worst-case manifestation:
  // each player creates their own battle, both end up alone with 0
  // peaks. Idempotent server-side rematch makes the race safe; this
  // poll auto-transitions the receiver even when the broadcast drops
  // entirely, so they never have to click rematch themselves and risk
  // a stale window. Fires once a second, stops the moment the
  // transition fires (parent unmounts the result screen).
  useEffect(() => {
    if (!isPrivate) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/battle/${result.battle_id}/state`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          rematch_battle_id?: string | null;
          rematch_code?: string | null;
          host_user_id?: string | null;
        };
        if (
          data.rematch_battle_id &&
          data.rematch_code &&
          !cancelled
        ) {
          // host_user_id from /state is the OLD battle's host, which
          // equals the rematch host (preserved by the rematch route).
          const isHost = currentUserId === data.host_user_id;
          if (onRematchInvite) onRematchInvite(data.rematch_battle_id, data.rematch_code);
          else if (onRematch)
            onRematch(data.rematch_battle_id, data.rematch_code, isHost);
        }
      } catch {
        // Network blip — try again next tick.
      }
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isPrivate, result.battle_id, onRematch, onRematchInvite, currentUserId]);

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
          title: 'holymog',
          text: isTie ? 'We tied' : youWon ? 'I mogged' : 'I got mogged',
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
      // host_user_id is the original host carried forward by the
      // server. The clicker is NOT necessarily the host — if a guest
      // clicked rematch, they're still a guest. Compute isHost from
      // the server's authoritative field, not from "I clicked = I'm
      // host", or the wrong tile gets the START button.
      const data = (await res.json()) as {
        battle_id: string;
        code: string;
        host_user_id: string | null;
      };
      onRematch(data.battle_id, data.code, currentUserId === data.host_user_id);
    } catch {
      setRematchError('network error');
      setRematching(false);
    }
  }, [result.battle_id, onRematch, currentUserId]);

  // Party (3+) path doesn't need an opponent — show podium even
  // when the local user can't be located in the participants list
  // (rare; spectator-ish edge). 1v1 path still bails if we can't
  // place me + opponent.
  if (!isParty && (!me || !opponent)) {
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
      <ResultAmbient
        won={isParty ? youInTopThree : youWon}
        tied={isTie}
        myScore={me?.final_score ?? sortedParticipants[0].final_score}
      />
      {(isParty ? youInTopThree : youWon) && <ResultConfetti />}
      {!isParty && !youWon && !isTie && <ResultLossWash />}

      <AppHeader authNext="/mog" />

      <main
        className="relative z-10 mx-auto w-full max-w-4xl px-5 pt-2 pb-12 sm:pt-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
      >
        {isParty ? (
          <>
            <ResultPartyHeadline
              rank={myRank}
              total={sortedParticipants.length}
              me={me}
              winner={sortedParticipants[0]}
            />
            <ResultPartyBoard
              sortedParticipants={sortedParticipants}
              currentUserId={currentUserId}
            />
          </>
        ) : (
          <>
            <ResultHeadline
              won={youWon}
              tied={isTie}
              myScore={me!.final_score}
              opponent={opponent!}
            />
            <ResultVersusBoard
              me={me!}
              opponent={opponent!}
              youWon={youWon}
              tied={isTie}
            />
            <ResultDelta
              me={me!}
              opponent={opponent!}
              youWon={youWon}
              tied={isTie}
            />
          </>
        )}

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
            handles all submit-state UX. Party finishes are private-only
            and have no single opponent, so the report flow doesn't
            apply. */}
        {isPublic && opponent && (
          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{ touchAction: 'manipulation', borderRadius: 2 }}
              className="inline-flex items-center gap-1.5 border border-white/20 bg-black px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 transition-colors hover:border-white hover:bg-white/[0.04] hover:text-white"
            >
              <Flag size={11} aria-hidden />
              report @{opponent.display_name}
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-zinc-600">
          {me && (
            <Link
              href={`/@${me.display_name}`}
              className="hover:text-zinc-400 hover:underline underline-offset-2"
            >
              @{me.display_name}
            </Link>
          )}
          {!isParty && opponent && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/@${opponent.display_name}`}
                className="hover:text-zinc-400 hover:underline underline-offset-2"
              >
                @{opponent.display_name}
              </Link>
            </>
          )}
          {isParty && me && (
            <span>· {sortedParticipants.length} players</span>
          )}
        </div>
      </main>

      {/* Report modal (public-1v1 only). Mounted at the page root
          via portal so it isn't clipped by the result screen's
          transformed parents. */}
      {isPublic && opponent && (
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
        className={`mt-3 text-base font-medium sm:mt-4 sm:text-lg ${subColor}`}
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
      <span className="text-[12px] font-medium text-zinc-400">ELO</span>
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
    <div className="mb-8 flex flex-col items-stretch gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
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
      {/* Decorative top/bottom lines anchor the VS text into the
          vertical gutter between two side-by-side cards. They only
          make sense on the side-by-side layout (sm+); on phone the
          cards are stacked vertically and we drop the lines so the
          divider is just the typographic "vs". */}
      <motion.span
        aria-hidden
        initial={{ height: 0 }}
        animate={{ height: '40%' }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="absolute left-1/2 top-0 hidden w-px -translate-x-1/2 bg-gradient-to-b from-white/20 to-transparent sm:block"
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
        className="absolute bottom-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-t from-white/20 to-transparent sm:block"
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
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-gradient-to-br from-amber-200 via-white to-amber-200 px-2 py-0.5 text-[11px] font-semibold text-black shadow-[0_0_18px_-2px_rgba(251,191,36,0.6)]"
        >
          ✦ Winner
        </motion.span>
      )}
      {tied && (
        <motion.span
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.4, delay: 0.7, type: 'spring', stiffness: 280 }}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-zinc-500/25 px-2 py-0.5 text-[11px] font-medium text-zinc-200"
        >
          = Tied
        </motion.span>
      )}
      <span className="text-[12px] font-medium text-zinc-500">{label}</span>

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

      <div className="flex items-center gap-2.5">
        <Frame
          slug={entry.equipped_frame ?? null}
          size={36}
          userStats={participantUserStats(entry)}
        >
          {entry.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.avatar_url}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full overflow-hidden rounded-full border border-white/15">
              <AvatarFallback seed={entry.display_name} textClassName="text-xs" />
            </span>
          )}
        </Frame>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          <NameFx
            slug={entry.equipped_name_fx ?? null}
            userStats={participantUserStats(entry)}
          >
            @{entry.display_name}
          </NameFx>
        </span>
        {entry.equipped_flair && (
          <Badge
            slug={entry.equipped_flair}
            size={20}
            userStats={participantUserStats(entry)}
          />
        )}
      </div>
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
      <span className="text-zinc-500">Margin</span>
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
      <span className="text-zinc-500">·</span>
      <span className="text-[12px] font-medium text-zinc-300">{margin}</span>
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
          className="group relative inline-flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full border border-white/30 bg-white/[0.06] text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:bg-white/[0.1] hover:shadow-[0_0_32px_-4px_rgba(255,255,255,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {/* Soft pulsing halo to nudge "this is the next action" */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 animate-pulse rounded-full bg-white/15 blur-xl"
          />
          {sharing ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Rendering…
            </>
          ) : (
            <>
              <Download
                size={14}
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-y-0.5"
              />
              Share
            </>
          )}
        </button>
        {isPrivate ? (
          <button
            type="button"
            onClick={onRematch}
            disabled={rematching}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-12 flex-[1.2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-all hover:shadow-[0_8px_36px_-4px_rgba(255,255,255,0.7)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rematching ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Rematching…
              </>
            ) : (
              <>Rematch</>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onFindAnother}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex h-12 flex-[1.2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-all hover:shadow-[0_8px_36px_-4px_rgba(255,255,255,0.7)]"
          >
            Find another
          </button>
        )}
        <Link
          href="/"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm font-medium text-white backdrop-blur-sm hover:bg-white/[0.08]"
        >
          Home
        </Link>
      </div>
    </motion.div>
  );
}

// ---------- Party (3+) result components --------------------------------

type ResultParticipant = FinishPayload['participants'][number];

/**
 * Rank-aware headline for party finishes. Replaces the 1v1
 * "you cooked @opponent" copy with copy that scales with how many
 * people were in the room AND where YOU placed. When the local user
 * isn't in the participants list (rare spectator-ish edge), falls
 * back to a generic "battle finished".
 */
function ResultPartyHeadline({
  rank,
  total,
  me,
  winner,
}: {
  rank: number;
  total: number;
  me: ResultParticipant | undefined;
  winner: ResultParticipant;
}) {
  let copy: { kicker: string; line: string; accent: string };
  if (!me) {
    copy = {
      kicker: 'battle finished',
      line: `@${winner.display_name} took the win`,
      accent: '#fbbf24',
    };
  } else if (rank === 1) {
    copy = {
      kicker: 'you mogged everyone',
      line: `${total - 1} player${total - 1 === 1 ? '' : 's'} cooked`,
      accent: '#fbbf24',
    };
  } else if (rank === 2) {
    copy = {
      kicker: 'second place',
      line: 'so close to the top',
      accent: '#cbd5e1',
    };
  } else if (rank === 3) {
    copy = {
      kicker: 'podium finish',
      line: 'bronze counts',
      accent: '#fb923c',
    };
  } else if (rank <= 5) {
    copy = {
      kicker: 'honorable mention',
      line: `${rank}th of ${total}`,
      accent: '#a78bfa',
    };
  } else {
    copy = {
      kicker: 'you got cooked',
      line: `${rank}th of ${total}`,
      accent: '#fb7185',
    };
  }
  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55 }}
      className="mb-6 text-center"
    >
      <span
        className="block text-[12px] font-semibold uppercase tracking-[0.18em]"
        style={{
          color: copy.accent,
          textShadow: `0 0 18px ${copy.accent}66`,
        }}
      >
        {copy.kicker}
      </span>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
        {copy.line}
      </h1>
    </motion.div>
  );
}

/**
 * Top-3 podium + honorable mentions + leaderboard tail. Layout
 * scales with participant count: 3-5 players show podium + (maybe)
 * a 2-wide honorable-mention strip; 6+ adds a compact list of
 * everyone else. Caller is responsible for ensuring
 * sortedParticipants has at least 3 entries — the component will
 * still render with fewer but it'll look wrong.
 */
function ResultPartyBoard({
  sortedParticipants,
  currentUserId,
}: {
  sortedParticipants: ResultParticipant[];
  currentUserId: string;
}) {
  const top3 = sortedParticipants.slice(0, 3);
  const honorable = sortedParticipants.slice(3, 5);
  const rest = sortedParticipants.slice(5);
  // 2 - 1 - 3 ordering puts the tallest column (1st) centred.
  const podiumOrder: Array<{ rank: 1 | 2 | 3; player: ResultParticipant | undefined }> = [
    { rank: 2, player: top3[1] },
    { rank: 1, player: top3[0] },
    { rank: 3, player: top3[2] },
  ];
  return (
    <div className="mb-8 flex flex-col items-center gap-6">
      {/* Stair-stepped podium — three columns side by side, 1st in
          the middle on the tallest platform. */}
      <div className="flex w-full max-w-lg items-end justify-center gap-2 sm:gap-3">
        {podiumOrder.map(
          ({ rank, player }) =>
            player && (
              <PartyPodiumColumn
                key={rank}
                rank={rank}
                player={player}
                isYou={player.user_id === currentUserId}
              />
            ),
        )}
      </div>
      {honorable.length > 0 && (
        <div className="mt-2 w-full max-w-lg">
          <span className="mb-2 block text-center text-[13px] font-medium text-amber-200/70">
            Honorable mentions
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {honorable.map((p, idx) => (
              <HonorableMentionRow
                key={p.user_id}
                rank={4 + idx}
                player={p}
                isYou={p.user_id === currentUserId}
              />
            ))}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-2 w-full max-w-lg">
          <span className="mb-2 block text-center text-[13px] font-medium text-white/45">
            Also played
          </span>
          <ul className="flex flex-col gap-1">
            {rest.map((p, idx) => (
              <AlsoPlayedRow
                key={p.user_id}
                rank={6 + idx}
                player={p}
                isYou={p.user_id === currentUserId}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Per-rank theming for the stair-stepped podium. Numbers + classes
// chosen so 1st sits dramatically higher than the other two without
// overflowing a phone-portrait viewport. Glow stripped out — each
// platform reads via a hard medal-coloured top stripe + diagonal
// hatch + (1st only) a slow shimmer sweep instead.
const PARTY_PODIUM_THEME: Record<
  1 | 2 | 3,
  {
    accent: string;
    platformHeight: string;
    avatarSize: number;
    scoreSize: string;
    nameSize: string;
    bgGradient: string;
    borderColor: string;
    rankNumberColor: string;
    scoreDelay: number;
  }
> = {
  1: {
    accent: '#fbbf24',
    platformHeight: 'h-56 sm:h-64',
    avatarSize: 104,
    scoreSize: 'text-3xl sm:text-5xl',
    nameSize: 'text-sm sm:text-base',
    bgGradient:
      'bg-gradient-to-b from-amber-500/45 via-amber-700/20 to-amber-950/65',
    borderColor: 'border-amber-400/85',
    rankNumberColor: 'text-amber-200/65',
    scoreDelay: 0.2,
  },
  2: {
    accent: '#e2e8f0',
    platformHeight: 'h-40 sm:h-48',
    avatarSize: 76,
    scoreSize: 'text-2xl sm:text-4xl',
    nameSize: 'text-[13px] sm:text-sm',
    bgGradient:
      'bg-gradient-to-b from-zinc-200/35 via-zinc-500/15 to-zinc-950/65',
    borderColor: 'border-zinc-200/65',
    rankNumberColor: 'text-zinc-100/55',
    scoreDelay: 0.5,
  },
  3: {
    accent: '#fb923c',
    platformHeight: 'h-32 sm:h-36',
    avatarSize: 68,
    scoreSize: 'text-2xl sm:text-4xl',
    nameSize: 'text-[13px] sm:text-sm',
    bgGradient:
      'bg-gradient-to-b from-orange-500/40 via-orange-700/20 to-orange-950/65',
    borderColor: 'border-orange-400/70',
    rankNumberColor: 'text-orange-200/60',
    scoreDelay: 0.65,
  },
};

function PartyPodiumColumn({
  rank,
  player,
  isYou,
}: {
  rank: 1 | 2 | 3;
  player: ResultParticipant;
  isYou: boolean;
}) {
  const theme = PARTY_PODIUM_THEME[rank];
  const isFirst = rank === 1;
  const animatedScore = useCountUp(player.final_score, 1100, theme.scoreDelay * 1000);
  const tier = getTier(player.final_score);
  const userStats = participantUserStats(player);

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        duration: 0.55,
        delay: theme.scoreDelay - 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      // `min-w-0` so the column shrinks to its flex-1 share instead of
      // expanding around a long display_name. Internal name span has
      // its own min-w-0 + truncate so the @handle cuts cleanly with
      // an ellipsis instead of pushing other columns narrower.
      className="flex min-w-0 flex-1 flex-col items-center"
    >
      {/* Crown above 1st place — gentle sway, no glow. */}
      {isFirst && (
        <motion.div
          animate={{ y: [0, -2, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-1"
        >
          <Crown size={22} className="text-amber-300" aria-hidden />
        </motion.div>
      )}

      {/* Avatar with frame — no medal-tinted halo. */}
      <div>
        <Frame
          slug={player.equipped_frame ?? null}
          size={theme.avatarSize}
          userStats={userStats}
        >
          {player.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.avatar_url}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full overflow-hidden rounded-full border border-white/15">
              <AvatarFallback
                seed={player.display_name}
                textClassName={isFirst ? 'text-2xl' : 'text-lg'}
              />
            </span>
          )}
        </Frame>
      </div>

      {/* Name + flair pill — wrapping div is min-w-0 + w-full so the
          truncate inside has a parent to cut against. */}
      <div
        className={`mt-1.5 flex w-full min-w-0 items-center justify-center gap-1 font-semibold text-white ${theme.nameSize}`}
      >
        <span className="block min-w-0 max-w-full truncate">
          <NameFx slug={player.equipped_name_fx ?? null} userStats={userStats}>
            @{player.display_name}
          </NameFx>
        </span>
        {player.equipped_flair && (
          <Badge
            slug={player.equipped_flair}
            size={isFirst ? 16 : 12}
            userStats={userStats}
          />
        )}
      </div>

      {/* Score + tier letter. */}
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`font-num font-extrabold leading-none tabular-nums ${theme.scoreSize}`}
          style={{
            color: theme.accent,
            textShadow: `0 0 20px ${theme.accent}55`,
          }}
        >
          {animatedScore}
        </span>
        <span
          className={`font-num font-black uppercase ${
            isFirst ? 'text-base' : 'text-sm'
          }`}
          style={tierTextStyle(player.final_score)}
        >
          {tier.letter}
        </span>
      </div>

      {isYou && (
        <span className="mt-1 inline-flex items-center rounded-md border border-white/30 bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-white">
          You
        </span>
      )}

      {/* Podium platform — 2px medal-coloured border, hard medal-color
          top stripe + diagonal hatch texture. Shimmer sweep only on
          1st place. No drop-shadow glow, no radial wash, no text
          shadow on the rank numeral. Mirrors the leaderboard podium
          treatment. */}
      <div
        className={`relative mt-3 flex w-full items-center justify-center overflow-hidden rounded-t-xl border-2 ${theme.borderColor} ${theme.bgGradient} ${theme.platformHeight}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1"
          style={{ background: theme.accent }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 10px)',
          }}
        />
        {isFirst && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 podium-shimmer-sweep"
          />
        )}
        <span
          className={`relative font-num text-7xl font-black leading-none tabular-nums sm:text-8xl ${theme.rankNumberColor}`}
        >
          {rank}
        </span>
      </div>
    </motion.div>
  );
}

function HonorableMentionRow({
  rank,
  player,
  isYou,
}: {
  rank: number;
  player: ResultParticipant;
  isYou: boolean;
}) {
  const userStats = participantUserStats(player);
  const color = getScoreColor(player.final_score);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.7 + (rank - 4) * 0.08 }}
      className="flex items-center gap-3 border border-white/15 bg-white/[0.02] px-3 py-2"
      style={{ borderRadius: 2 }}
    >
      <span className="font-num text-[14px] font-black tabular-nums text-white/60">
        {rank}.
      </span>
      <Frame slug={player.equipped_frame ?? null} size={28} userStats={userStats}>
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full overflow-hidden rounded-full border border-white/15">
            <AvatarFallback seed={player.display_name} textClassName="text-[10px]" />
          </span>
        )}
      </Frame>
      <span className="flex-1 min-w-0 truncate text-sm text-white">
        <NameFx slug={player.equipped_name_fx ?? null} userStats={userStats}>
          @{player.display_name}
        </NameFx>
      </span>
      {player.equipped_flair && (
        <Badge
          slug={player.equipped_flair}
          size={14}
          userStats={userStats}
        />
      )}
      <span
        className="font-num text-[18px] font-black tabular-nums"
        style={{ color }}
      >
        {player.final_score}
      </span>
      {isYou && (
        <span
          className="border border-white/25 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white"
          style={{ borderRadius: 2 }}
        >
          YOU
        </span>
      )}
    </motion.div>
  );
}

function AlsoPlayedRow({
  rank,
  player,
  isYou,
}: {
  rank: number;
  player: ResultParticipant;
  isYou: boolean;
}) {
  const userStats = participantUserStats(player);
  const color = getScoreColor(player.final_score);
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 + (rank - 6) * 0.05 }}
      className="flex items-center gap-2 border-l-2 border-white/10 bg-white/[0.01] px-2 py-1.5"
    >
      <span className="font-num w-6 text-center text-[12px] font-bold tabular-nums text-white/50">
        {rank}
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] text-white/85">
        <NameFx slug={player.equipped_name_fx ?? null} userStats={userStats}>
          @{player.display_name}
        </NameFx>
        {isYou && (
          <span className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/50">
            (you)
          </span>
        )}
      </span>
      <span
        className="font-num text-[14px] font-bold tabular-nums"
        style={{ color }}
      >
        {player.final_score}
      </span>
    </motion.li>
  );
}
