'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ShieldCheck, X } from 'lucide-react';
import type { FinalScores } from '@/types';
import { getTier, PHOTO_REQUIRED_THRESHOLD } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import { useUser } from '@/hooks/useUser';
import { clearLeaderboardCache } from '@/lib/leaderboardCache';

const MAX_NAME_LEN = 24;

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

  const [name, setName] = useState('');
  const [includePhoto, setIncludePhoto] = useState(false);
  // S-tier biometric consent. Required by BIPA + GDPR Art. 9 to be
  // affirmative, informed, and recorded — we gate the submit button
  // behind this checkbox and only show it for S-tier scores (≥87) where
  // a face photo must be uploaded for review.
  const [biometricConsent, setBiometricConsent] = useState(false);
  const [previous, setPrevious] = useState<PreviousEntry | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Briefly flag when an uppercase letter was auto-lowercased.
  const [lastTransform, setLastTransform] = useState<{
    upper: string;
    lower: string;
    id: number;
  } | null>(null);
  const lastTransformTimerRef = useRef<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerLetterMorph = useCallback((upper: string, lower: string) => {
    const id = Date.now() + Math.random();
    setLastTransform({ upper, lower, id });
    if (lastTransformTimerRef.current !== null) {
      window.clearTimeout(lastTransformTimerRef.current);
    }
    lastTransformTimerRef.current = window.setTimeout(() => {
      setLastTransform((cur) => (cur && cur.id === id ? null : cur));
      lastTransformTimerRef.current = null;
    }, 1400);
  }, []);

  useEffect(
    () => () => {
      if (lastTransformTimerRef.current !== null) {
        window.clearTimeout(lastTransformTimerRef.current);
      }
    },
    [],
  );

  // S-tier (≥87) forces the photo on. Same threshold the server enforces.
  const photoRequired = scores.overall >= PHOTO_REQUIRED_THRESHOLD;

  // Reset state every open. useLayoutEffect ensures no flash of stale data.
  useLayoutEffect(() => {
    if (!open) return;
    setName('');
    // If this score qualifies as S-tier, the photo is mandatory — start
    // checked. Otherwise default to off and let the user opt in.
    setIncludePhoto(photoRequired);
    // Biometric consent always defaults to FALSE on open so the user has
    // to affirmatively re-consent for each S-tier submission. Required
    // for BIPA/GDPR informed-consent compliance.
    setBiometricConsent(false);
    setPrevious(null);
    setStatus({ kind: 'idle' });
    setLastTransform(null);
    if (lastTransformTimerRef.current !== null) {
      window.clearTimeout(lastTransformTimerRef.current);
      lastTransformTimerRef.current = null;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [open, photoRequired]);

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
        if (data.entry?.name) {
          setName(data.entry.name);
        } else if (data.profile?.display_name) {
          setName(data.profile.display_name);
        }
        if (data.entry) {
          setPrevious({
            name: data.entry.name,
            overall: data.entry.overall,
            tier: data.entry.tier,
            hasPhoto: !!data.entry.image_url,
          });
          // S-tier locks the photo on regardless of the previous state.
          setIncludePhoto(photoRequired || !!data.entry.image_url);
        }
      } catch {
        // best-effort prefill
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, photoRequired]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return;
    setStatus({ kind: 'submitting' });
    try {
      const body: Record<string, unknown> = { name: trimmed, scores };
      if (includePhoto) body.imageBase64 = capturedImage;

      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
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
                : data.error === 'photo_required_for_high_scores'
                  ? 'S-tier scores require a photo for review'
                  : 'could not save, try again';
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
  }, [name, scores, includePhoto, capturedImage, onSubmitted, onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit();
  };

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
    name.trim().length === 0 ||
    // S-tier scores can't submit until the user explicitly checks the
    // biometric-consent box. Required for BIPA/GDPR informed consent.
    (photoRequired && !biometricConsent);

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
                  you · {name || 'set a name'}
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const lowered = raw.toLowerCase();
                    if (raw !== lowered) {
                      let upper = '';
                      let lower = '';
                      for (let i = 0; i < raw.length; i++) {
                        if (raw[i] !== lowered[i]) {
                          upper = raw[i];
                          lower = lowered[i];
                          break;
                        }
                      }
                      if (upper) triggerLetterMorph(upper, lower);
                    }
                    setName(lowered.slice(0, MAX_NAME_LEN));
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="your name"
                  maxLength={MAX_NAME_LEN}
                  className="mb-1 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                  autoComplete="off"
                  autoCapitalize="none"
                  aria-label="Name"
                />
                <div className="relative mb-3 h-[14px] text-[11px] leading-[14px]">
                  <AnimatePresence initial={false}>
                    {lastTransform ? (
                      <motion.div
                        key={`morph-${lastTransform.id}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 inline-flex items-center gap-1.5 normal-case"
                      >
                        <motion.span
                          initial={{ scale: 1.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.28, ease: 'easeOut' }}
                          className="inline-flex items-baseline gap-0.5 font-mono"
                        >
                          <span className="text-zinc-400 opacity-70">
                            {lastTransform.upper}
                          </span>
                          <span className="mx-0.5 text-zinc-500">→</span>
                          <motion.span
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              duration: 0.28,
                              delay: 0.08,
                              ease: 'easeOut',
                            }}
                            className="font-semibold text-amber-300"
                          >
                            {lastTransform.lower}
                          </motion.span>
                        </motion.span>
                        <span className="text-zinc-500">auto-lowercased</span>
                      </motion.div>
                    ) : (
                      <motion.span
                        key="default"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 block text-zinc-500"
                      >
                        e.g. brian gao
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (photoRequired) return;
                    setIncludePhoto((v) => !v);
                  }}
                  aria-pressed={includePhoto}
                  aria-disabled={photoRequired}
                  disabled={photoRequired}
                  title={
                    photoRequired
                      ? 'photo is required for S-tier scores so the leaderboard can be reviewed'
                      : undefined
                  }
                  className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    photoRequired
                      ? 'cursor-not-allowed border-emerald-500/30 bg-emerald-500/[0.06]'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
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
                    <span
                      className={`block text-sm ${photoRequired ? 'text-zinc-300' : 'text-white'}`}
                    >
                      {photoRequired
                        ? 'photo required (S-tier)'
                        : 'also share my photo'}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      {photoRequired
                        ? "S-tier scores need a photo so we can review the board. don't want to share? skip the submission."
                        : 'shows next to your name on the board'}
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

                {/* S-tier biometric consent. Required by BIPA + GDPR
                    Art. 9 to be affirmative + informed before any
                    biometric upload. Surfaced as a discrete gate above
                    the submit button so the user has to deliberately
                    check the box for each S-tier submission. */}
                {photoRequired && (
                  <button
                    type="button"
                    onClick={() => setBiometricConsent((v) => !v)}
                    aria-pressed={biometricConsent}
                    style={{ touchAction: 'manipulation' }}
                    className={`mb-3 flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      biometricConsent
                        ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                        : 'border-amber-500/40 bg-amber-500/[0.06]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                        biometricConsent
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-amber-500/70 bg-transparent'
                      }`}
                      aria-hidden
                    >
                      {biometricConsent && (
                        <Check size={13} strokeWidth={3} className="text-black" />
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-300">
                        <ShieldCheck size={11} aria-hidden /> S-tier consent
                      </span>
                      <span className="text-sm text-white">
                        I consent to uploading my face image as biometric
                        information.
                      </span>
                      <span className="text-[11px] leading-relaxed text-zinc-400">
                        Required because S-tier submissions include a
                        photo. We process biometric information only to
                        display your score on the public leaderboard. See
                        our{' '}
                        <Link
                          href="/terms#03"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/85 underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          biometric consent
                        </Link>{' '}
                        and{' '}
                        <Link
                          href="/privacy#03"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/85 underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          privacy policy
                        </Link>
                        . You can revoke at any time by emailing
                        hello@holymog.com.
                      </span>
                    </span>
                  </button>
                )}

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
