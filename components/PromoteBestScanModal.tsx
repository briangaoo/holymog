'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Trophy } from 'lucide-react';
import { getScoreColor } from '@/lib/scoreColor';
import { getTier } from '@/lib/tier';

type Props = {
  open: boolean;
  /** The user's actual all-time best (from profile.best_scan_overall). */
  bestOverall: number;
  /** What's currently on the leaderboard (entry.overall). */
  publishedOverall: number;
  /** Whether the user's current entry has a photo opt-in. Pre-checks
   *  the include-photo toggle when true so the user can land their new
   *  high score with a face if they already had one. */
  hadPhoto: boolean;
  onClose: () => void;
  /** Fires after a successful promote so the parent can refetch
   *  /api/account/me and the public profile sees the new entry. */
  onPromoted: () => void;
};

/**
 * One-shot prompt that surfaces in the settings tab when the user's
 * all-time best scan score exceeds the score on their current
 * leaderboard entry — i.e. they scanned a new high after publishing
 * an older one. Two paths out:
 *
 *   - "Update entry" promotes the historical best from scan_history
 *     directly via /api/account/promote-best-scan (one-click, no
 *     re-scan needed). Optional include-photo toggle.
 *   - "Not now" dismisses; the parent persists a session-scoped flag
 *     so the modal doesn't re-fire on every settings open.
 *
 * Mounted via React portal so it sits above the settings sections.
 */
export function PromoteBestScanModal({
  open,
  bestOverall,
  publishedOverall,
  hadPhoto,
  onClose,
  onPromoted,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [includePhoto, setIncludePhoto] = useState(hadPhoto);
  const [status, setStatus] = useState<
    'idle' | 'submitting' | { kind: 'error'; message: string }
  >('idle');

  // Reset toggle to caller-provided default whenever we re-open. Without
  // this, dismissing + re-opening the modal would carry the previous
  // session's choice.
  useEffect(() => {
    if (open) {
      setIncludePhoto(hadPhoto);
      setStatus('idle');
    }
  }, [open, hadPhoto]);

  // Lock body scroll while open so a tap on the dimmed area doesn't
  // scroll the settings underneath.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const submit = useCallback(async () => {
    setStatus('submitting');
    try {
      const res = await fetch('/api/account/promote-best-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_photo: includePhoto }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const msg =
          data.error === 'rate_limited'
            ? 'too many submissions, slow down'
            : data.error === 'no_scan_history'
              ? 'no scan history yet — scan first'
              : data.message ?? data.error ?? 'could not publish';
        setStatus({ kind: 'error', message: msg });
        return;
      }
      // Don't call onClose() here — the parent's onPromoted is
      // responsible for closing the modal (via its own state). Calling
      // onClose would also persist the "dismissed" sessionStorage
      // flag, which we want to reserve for the explicit "Not now"
      // path so a future even-higher scan still re-prompts.
      onPromoted();
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  }, [includePhoto, onPromoted]);

  if (!mounted) return null;

  const tier = getTier(bestOverall);
  const accent = tier.isGradient ? '#a855f7' : tier.color;
  const delta = bestOverall - publishedOverall;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promote-best-title"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm border-2 border-white/20 bg-black p-6"
            style={{
              borderRadius: 2,
              boxShadow: `0 0 48px -12px ${accent}66`,
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Trophy size={14} aria-hidden style={{ color: accent }} />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: accent }}
              >
                Your top scan isn&apos;t on the board
              </span>
            </div>
            <h2
              id="promote-best-title"
              className="mb-3 text-2xl font-bold uppercase leading-tight tracking-tight text-white"
            >
              Publish your new high?
            </h2>
            <p className="mb-2 text-[13px] leading-relaxed text-white/65">
              You scored a{' '}
              <span
                className="font-num font-bold tabular-nums"
                style={{ color: getScoreColor(bestOverall) }}
              >
                {bestOverall}
              </span>{' '}
              ({tier.letter}), but your leaderboard entry is still{' '}
              <span
                className="font-num font-bold tabular-nums"
                style={{ color: getScoreColor(publishedOverall) }}
              >
                {publishedOverall}
              </span>
              {delta > 0 && (
                <>
                  {' '}— that&apos;s{' '}
                  <span className="font-num font-bold tabular-nums text-emerald-300">
                    +{delta}
                  </span>{' '}
                  unpublished.
                </>
              )}
            </p>
            <p className="mb-5 text-[12px] leading-relaxed text-white/45">
              Update your entry now to make sure the leaderboard + your
              public profile both show the right score.
            </p>

            <button
              type="button"
              onClick={() => setIncludePhoto((v) => !v)}
              aria-pressed={includePhoto}
              className="mb-5 flex w-full items-start gap-3 border border-white/15 bg-white/[0.02] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
              style={{ borderRadius: 2, touchAction: 'manipulation' }}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center border transition-colors ${
                  includePhoto
                    ? 'border-white bg-white'
                    : 'border-white/30 bg-transparent'
                }`}
                style={{ borderRadius: 2 }}
                aria-hidden
              >
                {includePhoto && (
                  <Check size={13} strokeWidth={3} className="text-black" />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-white">
                  Show my face on the leaderboard
                </span>
                <span className="text-[11px] leading-relaxed text-white/50">
                  The image from your top scan publishes alongside your
                  name. You can flip this off anytime in settings → privacy.
                </span>
              </span>
            </button>

            {typeof status === 'object' && status.kind === 'error' && (
              <p className="mb-3 text-[11px] text-red-400">{status.message}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === 'submitting'}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-1 items-center justify-center border-2 border-white/30 bg-black text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white/[0.04] disabled:opacity-40"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={status === 'submitting'}
                style={{ touchAction: 'manipulation', borderRadius: 2 }}
                className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 bg-white text-xs font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden />{' '}
                    Updating
                  </>
                ) : (
                  <>
                    <Trophy size={12} aria-hidden /> Update entry
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}
