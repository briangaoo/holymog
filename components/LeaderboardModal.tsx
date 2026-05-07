'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, KeyRound, X } from 'lucide-react';
import type { FinalScores } from '@/types';
import { getTier } from '@/lib/tier';
import { getScoreColor } from '@/lib/scoreColor';
import {
  ACCOUNT_KEY_LENGTH,
  isValidAccountKey,
  normaliseAccountKey,
} from '@/lib/account';
import {
  fetchAccount,
  useAccount,
  type AccountSummary,
} from '@/hooks/useAccount';
import { clearLeaderboardCache } from '@/lib/leaderboardCache';
import { AccountKeyCard } from './AccountKeyCard';

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

type AccountState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ready'; summary: AccountSummary }
  | { kind: 'missing' };

function maskKey(key: string): string {
  return `${key.slice(0, 4)}••••`;
}

export function LeaderboardModal({
  open,
  scores,
  capturedImage,
  onClose,
  onSubmitted,
}: Props) {
  const {
    storedKey,
    storedName,
    storedPhotoPref,
    storedOverall,
    saveAccount,
    clearAccount,
  } = useAccount();

  const [name, setName] = useState('');
  const [includePhoto, setIncludePhoto] = useState(false);

  // Active key drives behaviour: null → fresh insert; set → update existing.
  // Sourced from localStorage at open time, or set after a successful paste-key lookup.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState>({ kind: 'none' });

  // Paste-key flow (only used when there is no stored key yet).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // When the server issues a new key (isNew=true), we swap the modal to the
  // one-time AccountKeyCard before closing.
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  // When an uppercase letter is auto-lowercased, briefly show the transform
  // (e.g. `B → b`) below the input so users see what just happened — keeps
  // them from suspecting their shift / caps-lock key is broken.
  const [lastTransform, setLastTransform] = useState<{
    upper: string;
    lower: string;
    id: number;
  } | null>(null);
  const lastTransformTimerRef = useRef<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const pasteRef = useRef<HTMLInputElement | null>(null);

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

  // Reset + prefill in a single layout effect: runs synchronously after the
  // open=true render commits but BEFORE the browser paints, so the user never
  // sees the "empty" intermediate state. With useAccount reading localStorage
  // synchronously, this lands the comparison block on the first paint.
  useLayoutEffect(() => {
    if (!open) return;

    setPasteOpen(false);
    setPasteValue('');
    setPasteError(null);
    setPasteLoading(false);
    setStatus({ kind: 'idle' });
    setIssuedKey(null);
    setLastTransform(null);
    if (lastTransformTimerRef.current !== null) {
      window.clearTimeout(lastTransformTimerRef.current);
      lastTransformTimerRef.current = null;
    }

    if (storedKey) {
      setActiveKey(storedKey);
      setName(storedName);
      setIncludePhoto(storedPhotoPref);
      if (typeof storedOverall === 'number') {
        setAccount({
          kind: 'ready',
          summary: {
            name: storedName,
            overall: storedOverall,
            tier: getTier(storedOverall).letter,
            sub: { jawline: 0, eyes: 0, skin: 0, cheekbones: 0 },
            hasPhoto: storedPhotoPref,
            imageUrl: null,
          },
        });
      } else {
        setAccount({ kind: 'loading' });
      }
    } else {
      setActiveKey(null);
      setName('');
      setIncludePhoto(false);
      setAccount({ kind: 'none' });
    }

    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
    // Only re-run when `open` flips. Stored-* values are captured at run time
    // so we always pick up the latest localStorage state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch the canonical account summary whenever we have an active key. If we
  // already rendered a stub from cache, only update on success — preserve the
  // cached values on error so the comparison block doesn't flash to empty.
  useEffect(() => {
    if (!open || !activeKey) return;
    let cancelled = false;
    setAccount((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    (async () => {
      try {
        const summary = await fetchAccount(activeKey);
        if (cancelled) return;
        if (!summary) {
          setAccount({ kind: 'missing' });
        } else {
          setAccount({ kind: 'ready', summary });
        }
      } catch {
        if (!cancelled) {
          setAccount((prev) => (prev.kind === 'ready' ? prev : { kind: 'missing' }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeKey]);

  // If a stored key turns out to be missing on the server, drop it locally
  // and fall back to the first-time flow.
  useEffect(() => {
    if (account.kind !== 'missing') return;
    if (!activeKey) return;
    if (storedKey === activeKey) clearAccount();
    setActiveKey(null);
    setAccount({ kind: 'none' });
    setName('');
    setIncludePhoto(false);
  }, [account.kind, activeKey, storedKey, clearAccount]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return;
    setStatus({ kind: 'submitting' });
    try {
      const body: Record<string, unknown> = { name: trimmed, scores };
      if (includePhoto) body.imageBase64 = capturedImage;
      if (activeKey) body.key = activeKey;

      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        key?: string;
        isNew?: boolean;
      };

      if (!res.ok) {
        // Stored key gone on server: clear and let user resubmit fresh.
        if (data.error === 'key_not_found') {
          clearAccount();
          setActiveKey(null);
          setAccount({ kind: 'none' });
          setStatus({
            kind: 'error',
            message: 'account not found, submit again as a new entry',
          });
          return;
        }
        const msg =
          data.error === 'rate_limited'
            ? 'too many submissions, slow down'
            : data.error === 'leaderboard_unconfigured'
              ? 'leaderboard not yet available'
              : 'could not save, try again';
        setStatus({ kind: 'error', message: msg });
        return;
      }

      const returnedKey = data.key ?? activeKey ?? null;
      if (returnedKey) {
        saveAccount({
          key: returnedKey,
          name: trimmed,
          photoPref: includePhoto,
          overall: scores.overall,
        });
      }
      // Invalidate the prefetched leaderboard so the next /leaderboard visit
      // re-fetches and shows the new (or updated) entry.
      clearLeaderboardCache();
      onSubmitted?.();

      if (data.isNew && returnedKey) {
        setIssuedKey(returnedKey);
        setStatus({ kind: 'idle' });
        return;
      }

      setStatus({ kind: 'success' });
      window.setTimeout(onClose, 900);
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  }, [
    name,
    scores,
    includePhoto,
    capturedImage,
    activeKey,
    saveAccount,
    onSubmitted,
    onClose,
    clearAccount,
  ]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit();
  };

  const submitPasteKey = useCallback(async () => {
    const k = normaliseAccountKey(pasteValue);
    if (!isValidAccountKey(k)) {
      setPasteError('8 letters or numbers');
      return;
    }
    setPasteLoading(true);
    setPasteError(null);
    try {
      const summary = await fetchAccount(k);
      if (!summary) {
        setPasteError('no account found with that key');
        setPasteLoading(false);
        return;
      }
      setActiveKey(k);
      setAccount({ kind: 'ready', summary });
      setName(summary.name);
      setIncludePhoto(summary.hasPhoto);
      setPasteOpen(false);
      setPasteValue('');
    } catch {
      setPasteError('lookup failed, try again');
    } finally {
      setPasteLoading(false);
    }
  }, [pasteValue]);

  // Score comparison block, rendered when an existing entry is loaded.
  const previous =
    account.kind === 'ready' ? account.summary : null;
  const newScore = scores.overall;
  const newTier = getTier(newScore);
  const prevTier = previous ? getTier(previous.overall) : null;
  const delta = previous ? newScore - previous.overall : 0;

  const submitLabel = previous
    ? delta < 0
      ? 'Replace anyway'
      : 'Replace'
    : 'Submit';
  const submitDisabled =
    status.kind === 'submitting' ||
    status.kind === 'success' ||
    name.trim().length === 0;

  const showAccountChip = !!activeKey;
  const showPasteOption = !activeKey && !pasteOpen && !issuedKey;

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
                {issuedKey ? 'Save your key' : 'Add to leaderboard'}
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

            {issuedKey ? (
              <AccountKeyCard
                accountKey={issuedKey}
                onDone={onClose}
              />
            ) : (
              <>
                {showAccountChip && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    linked to your account ·{' '}
                    <span className="normal-case">{maskKey(activeKey)}</span>
                  </div>
                )}

                {!showAccountChip && (
                  <p className="mb-3 text-sm text-zinc-400">
                    Pick a name or nickname to show next to your score.
                  </p>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const lowered = raw.toLowerCase();
                    if (raw !== lowered) {
                      // First differing char is almost always the just-typed
                      // uppercase letter — show its transform.
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
                      also share my photo
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      shows next to your name on the board
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

                {previous && (
                  <ComparisonBlock
                    prevOverall={previous.overall}
                    prevTierLetter={prevTier?.letter ?? ''}
                    newOverall={newScore}
                    newTierLetter={newTier.letter}
                    delta={delta}
                  />
                )}

                {showPasteOption && (
                  <button
                    type="button"
                    onClick={() => {
                      setPasteOpen(true);
                      window.setTimeout(() => pasteRef.current?.focus(), 50);
                    }}
                    className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-zinc-400 transition-colors hover:text-white"
                  >
                    <KeyRound size={12} aria-hidden />
                    have a key from another device?
                  </button>
                )}

                {pasteOpen && (
                  <div className="mb-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <label
                      htmlFor="paste-key"
                      className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400"
                    >
                      enter your key
                    </label>
                    <div className="flex gap-2">
                      <input
                        ref={pasteRef}
                        id="paste-key"
                        type="text"
                        value={pasteValue}
                        onChange={(e) => {
                          const next = normaliseAccountKey(e.target.value).slice(
                            0,
                            ACCOUNT_KEY_LENGTH,
                          );
                          setPasteValue(next);
                          setPasteError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitPasteKey();
                        }}
                        placeholder="ABCD1234"
                        maxLength={ACCOUNT_KEY_LENGTH}
                        className="flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-sm tracking-[0.2em] text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none uppercase placeholder:uppercase"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-label="Account key"
                      />
                      <button
                        type="button"
                        onClick={() => void submitPasteKey()}
                        disabled={
                          pasteLoading ||
                          pasteValue.length !== ACCOUNT_KEY_LENGTH
                        }
                        style={{ touchAction: 'manipulation' }}
                        className="rounded-lg bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {pasteLoading ? '…' : 'Use'}
                      </button>
                    </div>
                    {pasteError && (
                      <p className="text-[11px] text-red-400">{pasteError}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPasteOpen(false);
                        setPasteValue('');
                        setPasteError(null);
                      }}
                      className="self-start text-[11px] text-zinc-500 hover:text-zinc-300"
                    >
                      cancel
                    </button>
                  </div>
                )}

                {status.kind === 'error' && (
                  <p className="mb-3 text-xs text-red-400">{status.message}</p>
                )}
                {status.kind === 'success' && (
                  <p className="mb-3 text-xs text-emerald-400">
                    {activeKey ? 'updated, see you on the board' : 'added, see you on the board'}
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
