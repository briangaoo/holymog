'use client';

import { useState } from 'react';
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

export function AuthModal({ open, onClose, context, next }: Props) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
      const res = await signIn('resend', {
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
          aria-labelledby="auth-title"
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
              <h2 id="auth-title" className="text-base font-semibold text-white">
                sign in{context ? ` ${context}` : ''}
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

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => oauth('google')}
                style={{ touchAction: 'manipulation' }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                continue with google
              </button>

              <div className="my-2 flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {!emailMode ? (
                <button
                  type="button"
                  onClick={() => setEmailMode(true)}
                  style={{ touchAction: 'manipulation' }}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
                >
                  <Mail size={14} aria-hidden /> email me a link
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                    autoComplete="email"
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
