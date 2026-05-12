'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Swords } from 'lucide-react';
import { captureCurrentAsBack, consumeModalRestore } from '@/lib/back-nav';

type Props = {
  open: boolean;
  onAcknowledge: () => void;
};

/**
 * First-mog-battle consent dialog. Fires on the first public OR private
 * battle entry attempt. Affirmative-consent checkbox required.
 *
 * Acknowledgement persists to localStorage at `holymog-battle-consent-accepted`
 * (separate from the `/scan` privacy gate at `holymog-consent-accepted`
 * — battles have different data flows: live video to opponent(s),
 * peak-frame archived to a private bucket, in-app report surface).
 */
export function BattleConsentModal({ open, onAcknowledge }: Props) {
  const [accepted, setAccepted] = useState(false);

  // Restore the checkbox if the user clicked /terms or /privacy from
  // inside this modal — the back-nav breadcrumb dropped on link
  // click is consumed here so the user lands back here with the
  // popup open and the box still ticked.
  useEffect(() => {
    if (!open) return;
    const restored = consumeModalRestore('battle');
    if (restored && typeof restored.accepted === 'boolean') {
      setAccepted(restored.accepted);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-consent-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <h2
              id="battle-consent-title"
              className="mb-1.5 inline-flex items-center gap-2 text-lg font-semibold text-white"
            >
              <Swords size={16} className="text-sky-400" aria-hidden />
              before your first battle
            </h2>
            <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
              quick read before you queue.
            </p>

            <ul className="space-y-2.5 text-[13px] leading-relaxed text-zinc-300">
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  your camera is{' '}
                  <strong className="font-semibold text-white">
                    streamed live
                  </strong>{' '}
                  to your opponent(s) via LiveKit for the duration of the
                  match. no audio is published. nothing is recorded on our
                  servers.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  your{' '}
                  <strong className="font-semibold text-white">
                    highest-scoring frame
                  </strong>{' '}
                  in each battle is saved to our private archive (
                  <code className="font-mono text-[11px] text-zinc-400">
                    holymog-battles
                  </code>
                  ) so we can verify reports. never publicly readable.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  in public 1v1 only, your opponent can{' '}
                  <strong className="font-semibold text-white">
                    report you
                  </strong>{' '}
                  after the match (cheating, minors, illegal content,
                  harassment). if we ban you, you&apos;ll get an email.
                  otherwise nothing is surfaced to you.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  showing minors, nudity, sexual content, or attempting to
                  manipulate the score (deepfakes / celebrity photos) gets
                  you{' '}
                  <strong className="font-semibold text-white">
                    permanently banned
                  </strong>
                  .
                </span>
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setAccepted((v) => !v)}
              aria-pressed={accepted}
              style={{ touchAction: 'manipulation' }}
              className={`mt-5 flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                accepted
                  ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                  accepted
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-white/25 bg-transparent'
                }`}
              >
                {accepted && (
                  <Check
                    size={13}
                    strokeWidth={3}
                    className="text-black"
                    aria-hidden
                  />
                )}
              </span>
              <span className="text-[12px] leading-relaxed text-zinc-200">
                I&apos;ve read this and agree to the{' '}
                <Link
                  href="/terms"
                  onClick={(e) => {
                    e.stopPropagation();
                    captureCurrentAsBack({
                      id: 'battle',
                      state: { accepted },
                    });
                  }}
                  className="font-medium text-white underline-offset-2 hover:underline"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  onClick={(e) => {
                    e.stopPropagation();
                    captureCurrentAsBack({
                      id: 'battle',
                      state: { accepted },
                    });
                  }}
                  className="font-medium text-white underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </button>

            <button
              type="button"
              onClick={onAcknowledge}
              disabled={!accepted}
              aria-label="accept and continue"
              style={{ touchAction: 'manipulation' }}
              className="mt-3 h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              {accepted ? 'accept & continue' : 'check the box to continue'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * localStorage key used by both /mog and /mog/battle to gate battle
 * entry behind the consent modal. Exported so callers stay in sync.
 */
export const BATTLE_CONSENT_KEY = 'holymog-battle-consent-accepted';

/**
 * Read the consent flag synchronously. Returns false when SSR or when
 * localStorage is unavailable. Callers also need to track a "checked"
 * flag separately if they want to avoid the first-render flash.
 */
export function readBattleConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage.getItem(BATTLE_CONSENT_KEY);
  } catch {
    return false;
  }
}

export function writeBattleConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BATTLE_CONSENT_KEY, '1');
  } catch {
    // private mode / quota — modal will just re-show on next try
  }
}
