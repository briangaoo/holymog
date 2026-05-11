'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, ShieldCheck, X } from 'lucide-react';
import type { FinalScores } from '@/types';
import { getTier, PHOTO_REQUIRED_THRESHOLD } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { useUser } from '@/hooks/useUser';
import { clearLeaderboardCache } from '@/lib/leaderboardCache';

type Props = {
  open: boolean;
  scores: FinalScores;
  capturedImage: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

type PreviousEntry = {
  name: string;
  overall: number;
  tier: string;
  hasPhoto: boolean;
};

export function LeaderboardModal({
  open,
  scores,
  capturedImage,
  onClose,
  onSubmitted,
}: Props) {
  const { user, loading: userLoading } = useUser();

  // The display name is read from the user's profile — not editable here.
  const [profileName, setProfileName] = useState<string | null>(null);
  const [includePhoto, setIncludePhoto] = useState(false);
  // Privacy + storage acknowledgement — required for any submission.
  // The user has to actively confirm they understand:
  //   1. Their scan image is saved server-side (we already do this on
  //      every scan via /api/score → holymog-scans private bucket).
  //   2. If their score is ≥ S-tier, the saved image is reviewed by
  //      a human for legitimacy. No auto-action against the entry —
  //      it's anti-cheat verification only.
  // BIPA + GDPR Art. 9 require affirmative, informed, and recorded
  // consent for biometric processing.
  const [scanDataConsent, setScanDataConsent] = useState(false);
  const [previous, setPrevious] = useState<PreviousEntry | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // S-tier scores trigger the human review flow but no longer require
  // a photo on the public board — privacy first, anti-cheat is handled
  // server-side via the saved image archive.
  const triggersReview = scores.overall >= PHOTO_REQUIRED_THRESHOLD;

  // Reset state every open. useLayoutEffect ensures no flash of stale data.
  useLayoutEffect(() => {
    if (!open) return;
    setProfileName(null);
    setIncludePhoto(false);
    setScanDataConsent(false);
    setPrevious(null);
    setStatus({ kind: 'idle' });
  }, [open]);

  // Once we know we're signed in, fetch profile + existing leaderboard row.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { display_name?: string };
          entry?: {
            name: string;
            overall: number;
            tier: string;
            image_url: string | null;
          } | null;
        };
        if (cancelled) return;
        if (data.profile?.display_name) {
          setProfileName(data.profile.display_name);
        }
        if (data.entry) {
          setPrevious({
            name: data.entry.name,
            overall: data.entry.overall,
            tier: data.entry.tier,
            hasPhoto: !!data.entry.image_url,
          });
          setIncludePhoto(!!data.entry.image_url);
        }
      } catch {
        // best-effort prefill
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const submit = useCallback(async () => {
    setStatus({ kind: 'submitting' });
    try {
      // Anti-cheat: server pulls scores from the user's most recent
      // pending_leaderboard_submissions row (populated by /api/score
      // immediately after Gemini scoring completes). Client only
      // sends include_photo. Forging a leaderboard score is now
      // mathematically impossible — every leaderboard row is a
      // direct copy of a server-validated scan from the last hour.
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_photo: includePhoto }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        isNew?: boolean;
      };

      if (!res.ok) {
        const msg =
          data.error === 'rate_limited'
            ? 'too many submissions, slow down'
            : data.error === 'unauthenticated'
              ? 'session expired, sign in again'
              : data.error === 'leaderboard_unconfigured'
                ? 'leaderboard not yet available'
                : data.error === 'no_pending_scan'
                  ? 'scan again — submissions must come from a scan within the last hour'
                  : data.error === 'profile_not_found'
                    ? 'profile not found, try again'
                    : data.message ?? 'could not save, try again';
        setStatus({ kind: 'error', message: msg });
        return;
      }

      clearLeaderboardCache();
      onSubmitted?.();
      setStatus({ kind: 'success' });
      window.setTimeout(onClose, 900);
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  }, [includePhoto, onSubmitted, onClose]);

  const newScore = scores.overall;
  const newTier = getTier(newScore);
  const delta = previous ? newScore - previous.overall : 0;
  const submitLabel = previous
    ? delta < 0
      ? 'Replace anyway'
      : 'Replace'
    : 'Submit';
  const submitDisabled =
    status.kind === 'submitting' ||
    status.kind === 'success' ||
    !profileName ||
    !scanDataConsent;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="lb-title" className="text-base font-semibold text-white">
                Add to leaderboard
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {userLoading ? (
              <p className="text-sm text-zinc-500">loading…</p>
            ) : !user ? (
              <p className="text-sm text-zinc-300">
                sign in to submit. close this modal and tap &ldquo;sign in&rdquo;
                in the header.
              </p>
            ) : (
              <>
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  you · {profileName ?? '…'}
                </div>

                {/* Read-only username display */}
                <div className="mb-1 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
                  <span className="text-sm text-zinc-400">
                    {profileName ?? '…'}
                  </span>
                  <Link
                    href="/account"
                    onClick={onClose}
                    className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                  >
                    edit in settings
                  </Link>
                </div>
                <p className="mb-3 text-[11px] text-zinc-600">
                  username is set in your account settings
                </p>

                {/* Optional public photo — never required, regardless
                    of tier. Privacy-first: the user's face appears on
                    the board only if they explicitly opt in here. */}
                <button
                  type="button"
                  onClick={() => setIncludePhoto((v) => !v)}
                  aria-pressed={includePhoto}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                      includePhoto
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-white/30 bg-transparent'
                    }`}
                    aria-hidden
                  >
                    {includePhoto && (
                      <Check size={13} strokeWidth={3} className="text-black" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm text-white">
                      also show my face on the board
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      shows next to your name publicly. you can toggle
                      this off anytime in settings → privacy.
                    </span>
                  </span>
                  {includePhoto && (
                    <span className="overflow-hidden rounded-full border border-white/15">
                      <img
                        src={capturedImage}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 object-cover"
                      />
                    </span>
                  )}
                </button>

                {/* High-score review notice — informational only, no
                    extra checkbox. The data-storage acknowledgement
                    below covers the BIPA/GDPR consent requirement. */}
                {triggersReview && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3">
                    <AlertTriangle
                      size={13}
                      aria-hidden
                      className="mt-0.5 flex-shrink-0 text-amber-300"
                    />
                    <p className="text-[11px] leading-relaxed text-amber-100/85">
                      <span className="font-semibold text-amber-200">
                        S-tier review.
                      </span>{' '}
                      scores at this level are flagged for human review
                      to keep the top of the board legitimate. we
                      verify only — no auto-removal of valid entries.
                    </p>
                  </div>
                )}

                {/* Scan-data storage consent. Always required (every
                    submission). Covers the BIPA/GDPR informed-consent
                    requirement for biometric processing. The image is
                    saved server-side already (every scan goes into
                    holymog-scans private bucket via /api/score) — the
                    user is acknowledging that fact. */}
                <button
                  type="button"
                  onClick={() => setScanDataConsent((v) => !v)}
                  aria-pressed={scanDataConsent}
                  style={{ touchAction: 'manipulation' }}
                  className={`mb-3 flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    scanDataConsent
                      ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                      scanDataConsent
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-white/30 bg-transparent'
                    }`}
                    aria-hidden
                  >
                    {scanDataConsent && (
                      <Check size={13} strokeWidth={3} className="text-black" />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-emerald-300">
                      <ShieldCheck size={11} aria-hidden /> scan storage
                    </span>
                    <span className="text-sm text-white">
                      I understand my scan image is saved.
                    </span>
                    <span className="text-[11px] leading-relaxed text-zinc-400">
                      every scan is stored in our private archive
                      regardless of whether you share it on the board —
                      so you can view your top scan in account, and so
                      we can review S-tier scores for legitimacy.
                      details:{' '}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/85 underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        privacy policy
                      </Link>
                      {' · '}
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/85 underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        terms
                      </Link>
                    </span>
                  </span>
                </button>

                {previous && (
                  <ComparisonBlock
                    prevOverall={previous.overall}
                    prevTierLetter={previous.tier}
                    newOverall={newScore}
                    newTierLetter={newTier.letter}
                    delta={delta}
                  />
                )}

                {status.kind === 'error' && (
                  <p className="mb-3 text-xs text-red-400">{status.message}</p>
                )}
                {status.kind === 'success' && (
                  <p className="mb-3 text-xs text-emerald-400">
                    {previous ? 'updated, see you on the board' : 'added, see you on the board'}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ touchAction: 'manipulation' }}
                    className="h-11 flex-1 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitDisabled}
                    style={{ touchAction: 'manipulation' }}
                    className="h-11 flex-1 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {status.kind === 'submitting' ? 'saving…' : submitLabel}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ComparisonBlock({
  prevOverall,
  prevTierLetter,
  newOverall,
  newTierLetter,
  delta,
}: {
  prevOverall: number;
  prevTierLetter: string;
  newOverall: number;
  newTierLetter: string;
  delta: number;
}) {
  const prevColor = getScoreColor(prevOverall);
  const newColor = getScoreColor(newOverall);
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#a1a1aa';

  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      <Cell
        label="previous"
        score={prevOverall}
        tier={prevTierLetter}
        color={prevColor}
      />
      <Cell
        label="this scan"
        score={newOverall}
        tier={newTierLetter}
        color={newColor}
        accentRight={
          <span
            className="ml-1 font-num text-[11px] font-semibold tabular-nums"
            style={{ color: deltaColor }}
          >
            {arrow} {delta > 0 ? '+' : ''}
            {delta}
          </span>
        }
      />
    </div>
  );
}

function Cell({
  label,
  score,
  tier,
  color,
  accentRight,
}: {
  label: string;
  score: number;
  tier: string;
  color: string;
  accentRight?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className="font-num text-2xl font-extrabold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-zinc-400 normal-case">{tier}</span>
        {accentRight}
      </div>
    </div>
  );
}
