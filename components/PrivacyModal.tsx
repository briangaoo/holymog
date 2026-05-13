'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { captureCurrentAsBack, consumeModalRestore } from '@/lib/back-nav';

type Props = {
  open: boolean;
  onAcknowledge: () => void;
};

/**
 * First-visit consent dialog. Blocks the scan flow until the user
 * acknowledges:
 *   1. every scan is sent to Google Gemini for analysis (and discarded
 *      by Google after);
 *   2. every signed-in scan is additionally archived to our private
 *      bucket — the part of the policy users tend to miss when
 *      written only in legal copy;
 *   3. leaderboard-photo and sharing carve-outs.
 *
 * Acceptance requires an active checkbox tick (not just a button
 * press) so that we have an affirmative-consent record for the
 * BIPA / GDPR Art. 9 informed-consent requirement, matching the
 * consent posture in /privacy § 3.
 */
export function PrivacyModal({ open, onAcknowledge }: Props) {
  const [accepted, setAccepted] = useState(false);

  // Restore the checkbox if the user clicked /terms or /privacy from
  // inside this modal — the back-nav breadcrumb dropped on link
  // click is consumed here so the user lands back on /scan with the
  // popup open and the box still ticked.
  useEffect(() => {
    if (!open) return;
    const restored = consumeModalRestore('privacy');
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
          aria-labelledby="privacy-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="w-full max-w-sm rounded-none border border-white/10 bg-black p-6"
          >
            <h2
              id="privacy-title"
              className="mb-1.5 text-lg font-semibold text-white"
            >
              Before your first scan
            </h2>
            <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
              what happens to your face when you scan.
            </p>

            <ul className="space-y-2.5 text-[13px] leading-relaxed text-zinc-300">
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  Every scan is sent to{' '}
                  <strong className="font-semibold text-white">
                    Google&rsquo;s Gemini <span className="uppercase">ai</span>
                  </strong>{' '}
                  for scoring. The image is processed there and
                  discarded by Google after the response.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  If you&rsquo;re signed in,{' '}
                  <strong className="font-semibold text-white">
                    every scan
                  </strong>{' '}
                  is also saved to our private archive (
                  <code className="font-mono text-[11px] text-zinc-400">
                    holymog-scans
                  </code>
                  ) so you can review your top scan from your account,
                  so we can verify S-tier scores, and so it&rsquo;s
                  available if you ever choose to publish to the
                  leaderboard. Anonymous (signed-out) scans aren&rsquo;t
                  saved anywhere.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  Putting your face on the public leaderboard is{' '}
                  <strong className="font-semibold text-white">
                    always optional
                  </strong>
                  , at every tier &mdash; you decide per submission and
                  can flip it off later from your account.
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
                />
                <span>
                  Shares to social media only contain your tier letter
                  &mdash; never your photo or sub-scores.
                </span>
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setAccepted((v) => !v)}
              aria-pressed={accepted}
              style={{ touchAction: 'manipulation' }}
              className={`mt-5 flex w-full items-start gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors ${
                accepted
                  ? 'border-white/40 bg-white/10/[0.08]'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border transition-colors ${
                  accepted
                    ? 'border-white bg-white/10'
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
                I have read and agree to the{' '}
                <Link
                  href="/terms"
                  onClick={(e) => {
                    e.stopPropagation();
                    captureCurrentAsBack({
                      id: 'privacy',
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
                      id: 'privacy',
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
              aria-label="Accept and continue"
              style={{ touchAction: 'manipulation' }}
              className="mt-3 h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              {accepted ? 'Accept & continue' : 'check the box to continue'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
