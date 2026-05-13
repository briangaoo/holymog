'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { captureCurrentAsBack, consumeModalRestore } from '@/lib/back-nav';

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
 * Magic-link email uses Gmail Workspace SMTP via Auth.js's Nodemailer
 * provider. The server-side lib/auth.ts only registers the provider
 * when EMAIL_SERVER_PASSWORD is set; if the user clicks "email me a
 * link" without SMTP configured, signIn('nodemailer', …) returns an
 * error and we surface it in the modal.
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true';
const APPLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === 'true';
const EMAIL_PROVIDER_ID = 'nodemailer';

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
        return;
      }
      // Auth.js's default fallback when the nodemailer provider isn't
      // registered server-side (EMAIL_SERVER_PASSWORD unset) is a redirect
      // to /api/auth/signin. With redirect:false the client doesn't follow
      // it, but res.url surfaces the path — treat that as a soft failure
      // rather than pretending the email was sent.
      if (res?.url && /\/api\/auth\/signin/.test(res.url)) {
        setStatus('error');
        setErrorMsg('email sign-in is not configured');
        return;
      }
      setStatus('sent');
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

  // Reset modal state after close so re-opening starts on the OAuth+form
  // view, not on the prior 'sent' / error confirmation. Delay matches the
  // exit-animation duration above so the user doesn't see a flicker.
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      setStatus('idle');
      setEmail('');
      setErrorMsg('');
      setEmailMode(false);
    }, 200);
    return () => window.clearTimeout(t);
  }, [open]);

  // If the user clicked our /terms or /privacy link, the source page
  // re-opened us via the parent's restore hook. Hydrate the in-progress
  // form so they don't lose their place — email half-typed, OTP view
  // expanded, etc.
  useEffect(() => {
    if (!open) return;
    const restored = consumeModalRestore('auth');
    if (!restored) return;
    if (typeof restored.email === 'string') setEmail(restored.email);
    if (typeof restored.emailMode === 'boolean') setEmailMode(restored.emailMode);
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
            className="relative w-full max-w-sm overflow-hidden rounded-none border border-white/15 p-6"
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

              {status === 'sent' ? (
                <SentInbox email={email} />
              ) : (
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
                    icon={
                      <Image
                        src="/apple-logo.png"
                        alt=""
                        width={20}
                        height={24}
                        className="h-5 w-auto object-contain"
                      />
                    }
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
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-white/15 bg-white/[0.04] text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
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
                        className="rounded-sm border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                        autoComplete="email"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void sendMagicLink();
                        }}
                      />
                      <button
                        type="button"
                        onClick={sendMagicLink}
                        disabled={status === 'sending'}
                        style={{ touchAction: 'manipulation' }}
                        className="h-11 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {status === 'sending' ? 'sending…' : 'send link'}
                      </button>
                    </div>
                  )}

                  {status === 'error' && (
                    <p className="mt-1 text-xs text-red-400">{errorMsg}</p>
                  )}
                </div>
              )}

              <p className="mt-6 text-[10px] leading-relaxed text-zinc-500">
                by signing in you agree to our{' '}
                {/* Same-tab — we drop a back-nav breadcrumb so /terms's
                    back link returns here with the modal re-opened
                    and the half-typed form preserved. */}
                <Link
                  href="/terms"
                  onClick={() =>
                    captureCurrentAsBack({
                      id: 'auth',
                      state: { email, emailMode },
                    })
                  }
                  className="text-zinc-400 underline-offset-2 hover:text-white hover:underline"
                >
                  terms
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  onClick={() =>
                    captureCurrentAsBack({
                      id: 'auth',
                      state: { email, emailMode },
                    })
                  }
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
        className={`relative flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-sm text-sm font-semibold opacity-50 ${baseColors}`}
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
      className={`flex h-12 w-full items-center justify-center gap-3 rounded-sm text-sm font-semibold shadow-md transition-colors ${baseColors} ${enabledHover}`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Post-send confirmation. Replaces the OAuth + magic-link form when the
 * server has accepted the email. Inbox shortcuts open the major webmail
 * providers in a new tab so the user can jump straight to the link
 * without context-switching through their app launcher.
 *
 * Logo paths (/inbox/*.png) are intentionally not committed yet — the
 * brand assets will be dropped in by hand.
 */
function SentInbox({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-1">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <Mail size={22} className="text-white" aria-hidden />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white">check your email</p>
        <p className="mt-1 text-xs text-zinc-400">
          we sent a sign-in link to{' '}
          <span className="text-zinc-200">{email}</span>
        </p>
        <p className="mt-2 text-[11px] text-zinc-500">
          don&apos;t see it? check your spam folder.
        </p>
      </div>
      <div className="grid w-full grid-cols-4 gap-2">
        <InboxLink
          href="https://mail.google.com"
          src="/inbox/gmail.jpeg"
          label="gmail"
        />
        <InboxLink
          href="https://outlook.live.com/mail"
          src="/inbox/outlook.jpeg"
          label="outlook"
        />
        <InboxLink
          href="https://mail.yahoo.com"
          src="/inbox/yahoo.jpeg"
          label="yahoo"
        />
        <InboxLink
          href="https://www.icloud.com/mail"
          src="/inbox/apple.jpeg"
          label="icloud"
        />
      </div>
    </div>
  );
}

function InboxLink({
  href,
  src,
  label,
}: {
  href: string;
  src: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`open ${label}`}
      className="flex h-14 items-center justify-center rounded-sm bg-white/[0.04] transition-colors hover:bg-white/[0.10]"
    >
      <Image
        src={src}
        alt={label}
        width={36}
        height={36}
        className="h-9 w-9 rounded-sm object-cover"
      />
    </a>
  );
}

