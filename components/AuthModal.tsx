'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail } from 'lucide-react';
import { signIn } from 'next-auth/react';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Contextual subtitle, e.g. "to battle" or "to submit". */
  context?: string;
  /** Where to redirect after successful auth. Defaults to current path. */
  next?: string;
};

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Sign-in modal. Mounted via React portal directly under <body> so it
 * escapes any ancestor that creates a containing block (anything with
 * backdrop-filter, transform, perspective, will-change). The AppHeader
 * uses backdrop-blur, so without the portal the modal's `fixed inset-0`
 * resolves against the header rather than the viewport — that's the bug
 * that made the dialog render at the top of the page instead of centered.
 */
export function AuthModal({ open, onClose, context, next }: Props) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // SSR safety: portals can't mount until we know we're on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auth.js's signIn() takes a `callbackUrl` to redirect to post-auth.
  // For OAuth flows it's the in-app destination; for magic links it's the
  // URL we drop the user at after they click the email link.
  const callbackUrl = next ?? '/';

  const oauth = async (provider: 'google') => {
    setStatus('idle');
    setErrorMsg('');
    try {
      await signIn(provider, { callbackUrl });
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'sign-in failed');
    }
  };

  const sendMagicLink = async () => {
    if (!email.includes('@')) {
      setStatus('error');
      setErrorMsg('valid email required');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await signIn('nodemailer', {
        email,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setStatus('error');
        setErrorMsg(res.error);
      } else {
        setStatus('sent');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'send failed');
    }
  };

  // Lock body scroll while open so the page beneath doesn't move.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          {/* Backdrop — heavy, with subtle backdrop-blur. */}
          <span
            aria-hidden
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/15 p-6"
            style={{
              backgroundColor: '#0c0c0c',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.7)',
            }}
          >
            {/* Subtle off-frame neutral wash so the panel has the same
                glassy depth as the cards but in a non-claiming silver
                tone — won't clash with scan-green or battle-yellow. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 65%)',
              }}
            />

            <div className="relative">
              <div className="mb-5 flex items-center justify-between">
                <h2
                  id="auth-title"
                  className="text-lg font-semibold text-white"
                >
                  sign in{context ? ` ${context}` : ''}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.10] hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => oauth('google')}
                  style={{ touchAction: 'manipulation' }}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-white text-sm font-semibold text-black shadow-md transition-colors hover:bg-zinc-100"
                >
                  <Image
                    src="/google-logo.png"
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                  continue with google
                </button>

                <div className="my-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <span className="h-px flex-1 bg-white/10" />
                  or
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                {!emailMode ? (
                  <button
                    type="button"
                    onClick={() => setEmailMode(true)}
                    style={{ touchAction: 'manipulation' }}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
                  >
                    <Mail size={14} aria-hidden /> email me a link
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      type="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                      autoComplete="email"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void sendMagicLink();
                      }}
                    />
                    <button
                      type="button"
                      onClick={sendMagicLink}
                      disabled={status === 'sending' || status === 'sent'}
                      style={{ touchAction: 'manipulation' }}
                      className="h-11 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {status === 'sending'
                        ? 'sending…'
                        : status === 'sent'
                          ? 'check your inbox'
                          : 'send link'}
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
                )}
              </div>

              <p className="mt-6 text-[10px] leading-relaxed text-zinc-500">
                by signing in you agree to our terms and privacy policy
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}
