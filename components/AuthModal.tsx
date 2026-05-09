'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
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
 * resolves against the header rather than the viewport.
 *
 * OAuth providers (Google, Apple) are rendered as disabled "Coming
 * soon" buttons until their env vars are configured server-side. The
 * actual provider activation lives in lib/auth.ts; this UI is a static
 * grey-out gated on `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` /
 * `NEXT_PUBLIC_AUTH_APPLE_ENABLED` (default false). When you set those
 * to "true" alongside the matching server-side AUTH_*_ID/SECRET, the
 * buttons activate automatically.
 *
 * Magic-link email uses Resend by default. When Gmail Workspace SMTP
 * comes back online, set `NEXT_PUBLIC_AUTH_EMAIL_PROVIDER=nodemailer`
 * to flip the client to call signIn('nodemailer', …). The server-side
 * lib/auth.ts independently picks Gmail when EMAIL_SERVER_PASSWORD is
 * set, so the only client-visible knob is which provider id to call.
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true';
const APPLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === 'true';
const EMAIL_PROVIDER_ID =
  process.env.NEXT_PUBLIC_AUTH_EMAIL_PROVIDER === 'nodemailer'
    ? 'nodemailer'
    : 'resend';

export function AuthModal({ open, onClose, context, next }: Props) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const callbackUrl = next ?? '/';

  const oauth = async (provider: 'google' | 'apple') => {
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
      const res = await signIn(EMAIL_PROVIDER_ID, {
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

  // Lock body scroll while open.
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
                <h2 id="auth-title" className="text-lg font-semibold text-white">
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
                {/* Google OAuth — disabled by default. Activate by
                    setting NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true on the
                    client AND AUTH_GOOGLE_ID/SECRET on the server. */}
                <ProviderButton
                  enabled={GOOGLE_ENABLED}
                  onClick={() => oauth('google')}
                  variant="white"
                  icon={
                    <Image
                      src="/google-logo.png"
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5"
                    />
                  }
                  label="continue with google"
                />

                {/* Apple OAuth — disabled by default. Activate by
                    setting NEXT_PUBLIC_AUTH_APPLE_ENABLED=true on the
                    client AND AUTH_APPLE_ID/SECRET on the server.
                    AUTH_APPLE_SECRET is a JWT generated from a .p8 key
                    (rotates every 6 months). See
                    https://authjs.dev/getting-started/providers/apple */}
                <ProviderButton
                  enabled={APPLE_ENABLED}
                  onClick={() => oauth('apple')}
                  variant="black"
                  icon={<AppleLogo />}
                  label="continue with apple"
                />

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
                by signing in you agree to our{' '}
                <Link
                  href="/terms"
                  className="text-zinc-400 underline-offset-2 hover:text-white hover:underline"
                >
                  terms
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  className="text-zinc-400 underline-offset-2 hover:text-white hover:underline"
                >
                  privacy policy
                </Link>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}

/**
 * Provider button. When `enabled` is false the button renders in a
 * greyed-out, click-blocked state with a "Coming soon" pill so the
 * brand presence is preserved while the underlying provider isn't yet
 * configured server-side. When enabled, it renders in full brand
 * colours.
 */
function ProviderButton({
  enabled,
  onClick,
  variant,
  icon,
  label,
}: {
  enabled: boolean;
  onClick: () => void;
  variant: 'white' | 'black';
  icon: React.ReactNode;
  label: string;
}) {
  const baseColors =
    variant === 'white'
      ? 'bg-white text-black'
      : 'bg-black text-white border border-white/15';
  const enabledHover =
    variant === 'white' ? 'hover:bg-zinc-100' : 'hover:bg-zinc-900';

  if (!enabled) {
    return (
      <div
        aria-disabled="true"
        title="coming soon"
        className={`relative flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-2xl text-sm font-semibold opacity-50 ${baseColors}`}
      >
        {icon}
        <span>{label}</span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-300">
          soon
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: 'manipulation' }}
      className={`flex h-12 w-full items-center justify-center gap-3 rounded-2xl text-sm font-semibold shadow-md transition-colors ${baseColors} ${enabledHover}`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Apple brand mark, inline so we don't need an asset file. */
function AppleLogo() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-[18px] w-[18px]"
    >
      <path d="M17.05 20.28c-.98.95-2.05.94-3.08.43-1.09-.52-2.08-.53-3.2 0-1.39.66-2.13.47-3-.43-5-5.04-4.28-12.7 1.27-12.97 1.34.07 2.27.74 3.06.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.5 4.08zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
