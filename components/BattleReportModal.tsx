'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Flag, Loader2, X } from 'lucide-react';

type Reason = 'cheating' | 'minor' | 'nudity' | 'harassment' | 'spam' | 'other';

const REASONS: Array<{ value: Reason; label: string; description: string }> = [
  {
    value: 'cheating',
    label: 'cheating',
    description: 'deepfake, ai-generated face, photo of a celebrity, etc.',
  },
  {
    value: 'minor',
    label: 'minor in video',
    description: 'anyone visible on camera appears under 18.',
  },
  {
    value: 'nudity',
    label: 'nudity / sexual content',
    description: 'nsfw visible on camera.',
  },
  {
    value: 'harassment',
    label: 'harassment / threats',
    description: 'targeted abuse, slurs, threats, hate symbols.',
  },
  {
    value: 'spam',
    label: 'spam / impersonation',
    description: 'fake account, advertising, claiming to be someone else.',
  },
  {
    value: 'other',
    label: 'other',
    description: 'something else — please describe below.',
  },
];

type Props = {
  open: boolean;
  battleId: string;
  reportedUserId: string;
  reportedDisplayName: string;
  onClose: () => void;
};

/**
 * Post-match report modal. Shown only for public 1v1 (the server-side
 * `/api/battle/report` endpoint also enforces public-only).
 *
 * Privacy posture:
 *   - The reported player is NEVER told a report was filed. We don't
 *     surface anything to them unless an admin clicks "Ban" in the
 *     email, at which point they get a notice via `banNoticeEmail`.
 *   - The reporter sees a generic "thanks" toast after submit — no
 *     hint about whether a duplicate already existed, no eta on review.
 *
 * Mounted via React portal so the report modal isn't clipped by the
 * result-screen's transformed parents (gradient blur layers).
 */
export function BattleReportModal({
  open,
  battleId,
  reportedUserId,
  reportedDisplayName,
  onClose,
}: Props) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'sent' | { kind: 'error'; message: string }
  >('idle');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      // Reset after exit animation finishes.
      const t = window.setTimeout(() => {
        setReason(null);
        setDetails('');
        setStatus('idle');
      }, 220);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const canSubmit =
    reason !== null && (reason !== 'other' || details.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || !reason) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/battle/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battle_id: battleId,
          reported_user_id: reportedUserId,
          reason,
          details: details.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const msg =
          data.error === 'rate_limited'
            ? 'too many reports, try later'
            : data.error === 'unauthenticated'
              ? 'sign in to report'
              : data.error === 'cannot_report_self'
                ? 'you can’t report yourself'
                : data.error === 'private_battle'
                  ? 'private battles aren’t reportable in-app — email hello@holymog.com'
                  : data.error === 'not_a_participant'
                    ? 'you can only report someone you actually matched against'
                    : data.error === 'battle_not_finished'
                      ? 'wait for the match to finish before reporting'
                      : data.message ?? data.error ?? 'could not send';
        setStatus({ kind: 'error', message: msg });
        return;
      }
      setStatus('sent');
      window.setTimeout(onClose, 1800);
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  };

  if (!mounted) return null;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-sm border border-white/15 bg-[#0c0c0c] p-6"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.7)',
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="report-title"
                className="inline-flex items-center gap-2 text-base font-semibold text-white"
              >
                <Flag size={14} className="text-white" aria-hidden />
                report @{reportedDisplayName}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="close"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.10] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            {status === 'sent' ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                  <Check size={22} className="text-white" />
                </span>
                <p className="text-sm font-medium text-white">
                  report submitted
                </p>
                <p className="max-w-[260px] text-[12px] leading-relaxed text-zinc-400">
                  our team will review. you won&apos;t hear back unless we take
                  action — the other player isn&apos;t notified either way.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-[12px] leading-relaxed text-zinc-400">
                  what happened? we&apos;ll review and decide whether to ban.
                  the other player won&apos;t see a notification.
                </p>

                <fieldset className="mb-3 flex flex-col gap-1.5">
                  <legend className="sr-only">report reason</legend>
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-2.5 transition-colors ${
                        reason === r.value
                          ? 'border-white bg-white/[0.08]'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                          reason === r.value
                            ? 'border-white bg-white/30'
                            : 'border-white/30'
                        }`}
                      >
                        {reason === r.value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[13px] text-white">{r.label}</span>
                        <span className="text-[11px] leading-relaxed text-zinc-500">
                          {r.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <div className="mb-3 flex flex-col gap-1.5">
                  <label
                    htmlFor="report-details"
                    className="text-[11px] text-zinc-400"
                  >
                    details{' '}
                    {reason === 'other' && (
                      <span className="text-white/60">(required)</span>
                    )}
                  </label>
                  <textarea
                    id="report-details"
                    value={details}
                    onChange={(e) =>
                      setDetails(e.target.value.slice(0, 1000))
                    }
                    rows={3}
                    placeholder="anything we should know"
                    className="resize-none rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                  <span className="self-end text-[10px] tabular-nums text-zinc-600">
                    {details.length} / 1000
                  </span>
                </div>

                {typeof status === 'object' && status.kind === 'error' && (
                  <p className="mb-3 text-[11px] text-red-400">
                    {status.message}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ touchAction: 'manipulation' }}
                    className="h-11 flex-1 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit || status === 'sending'}
                    style={{ touchAction: 'manipulation' }}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold uppercase tracking-[0.18em] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {status === 'sending' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" aria-hidden /> sending
                      </>
                    ) : (
                      'submit report'
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}
