'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Monitor,
  Plug,
  ShieldCheck,
  X,
} from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useUser } from '@/hooks/useUser';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Section, type SaveState, useAutoIdle } from './shared';

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true';
const APPLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === 'true';

/**
 * Account & security section — change email, connected OAuth accounts,
 * active sessions, two-factor authentication.
 *
 * The 2FA setup flow is multi-step inside this component:
 *   not-enabled → setting-up (show secret + uri, ask for code) → enabled (with backup codes)
 *
 * Sessions and connected accounts each have their own list with
 * inline kick / unlink actions. State updates optimistically; failed
 * actions surface inline error pills.
 */

type SessionItem = {
  id: string;
  expires_at: string;
  current: boolean;
};

type ConnectedAccount = {
  provider: string;
  type: string;
};

type TwoFactorStatus = 'not-enabled' | 'setting-up' | 'enabled';

export function AccountSection({
  twoFactorEnabled,
  email,
}: {
  twoFactorEnabled: boolean;
  email: string | null | undefined;
}) {
  return (
    <>
      <EmailBlock email={email} />
      <ConnectedAccountsBlock />
      <ActiveSessionsBlock />
      <TwoFactorBlock initialEnabled={twoFactorEnabled} />
    </>
  );
}

// ---- Email change ---------------------------------------------------------

function EmailBlock({ email }: { email: string | null | undefined }) {
  const [next, setNext] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [methods, setMethods] = useState<{
    hasEmailAuth: boolean;
    hasGoogle: boolean;
  }>({ hasEmailAuth: true, hasGoogle: false });
  useAutoIdle(state, setState, 4000);

  // Pull connected-accounts so we know which change paths to show. A
  // user with only Google linked shouldn't see the magic-link prompt;
  // an email-only user shouldn't see the Google re-auth button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/connected-accounts', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          accounts: { provider: string }[];
          has_email_auth: boolean;
        };
        if (cancelled) return;
        setMethods({
          hasEmailAuth: data.has_email_auth,
          hasGoogle: data.accounts.some((a) => a.provider === 'google'),
        });
      } catch {
        // best-effort; keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Surface ?email_changed=… status when the OAuth callback redirects
  // back here. ok = success; everything else is a parseable error.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('email_changed');
    if (!status) return;
    if (status === 'ok') {
      setState({ kind: 'saved' });
    } else {
      setState({
        kind: 'error',
        message:
          status === 'email_taken'
            ? 'that email is already used by another account'
            : status === 'same_email'
              ? 'that email is the same as your current one'
              : status === 'email_unverified'
                ? 'google says that email isn’t verified'
                : status === 'state_expired'
                  ? 'the verification link expired — try again'
                  : status === 'oauth_access_denied'
                    ? 'you cancelled the google sign-in'
                    : `change failed (${status})`,
      });
    }
    // Strip the param so refreshing doesn't re-trigger.
    params.delete('email_changed');
    const qs = params.toString();
    const cleanUrl =
      window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
  }, []);

  const dirty =
    next.trim().length > 0 &&
    next.trim().toLowerCase() !== (email ?? '').toLowerCase();

  const onSendLink = useCallback(async () => {
    setState({ kind: 'pending' });
    try {
      const res = await fetch('/api/account/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: next.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const msg =
          data.error === 'email_taken'
            ? 'email already used by another account'
            : data.error === 'same_email'
              ? 'same as current email'
              : data.error === 'invalid_email'
                ? 'invalid email format'
                : data.error === 'rate_limited'
                  ? 'too many attempts, try later'
                  : data.message ?? 'could not send';
        setState({ kind: 'error', message: msg });
        return;
      }
      setState({ kind: 'saved' });
      setNext('');
    } catch {
      setState({ kind: 'error', message: 'network error' });
    }
  }, [next]);

  const onGoogleReAuth = useCallback(() => {
    setState({ kind: 'pending' });
    window.location.href = '/api/account/email/oauth/google/start';
  }, []);

  return (
    <Section
      id="email"
      label="email"
      description="address used for sign-in, alerts, and digests."
      icon={Mail}
      accent="indigo"
    >
      <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
        <span className="flex-1 truncate text-[14px] text-zinc-200">
          {email ?? <span className="text-zinc-500">no email on file</span>}
        </span>
        <span className="text-[11px] text-zinc-500">current</span>
      </div>

      {/* Magic-link change path — visible only when the user actually
          has email auth set up. Sends a verify link to the new
          address; change completes only on click. */}
      {methods.hasEmailAuth && (
        <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-4">
          <label
            htmlFor="new-email"
            className="text-[12px] font-medium text-zinc-300"
          >
            change email via magic link
          </label>
          <div className="flex items-stretch gap-2">
            <input
              id="new-email"
              type="email"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                if (state.kind !== 'idle' && state.kind !== 'pending')
                  setState({ kind: 'idle' });
              }}
              placeholder="new@email.com"
              autoCapitalize="none"
              autoComplete="email"
              spellCheck={false}
              className="flex-1 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/15"
            />
            <button
              type="button"
              onClick={onSendLink}
              disabled={!dirty || state.kind === 'pending'}
              className="rounded-sm bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_0_2px_rgba(255,255,255,0.20)] disabled:opacity-40 disabled:hover:shadow-none"
            >
              {state.kind === 'pending' ? 'sending…' : 'send link'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            we&apos;ll send a verification link to the new address. the change
            only completes once you click it.
          </p>
        </div>
      )}

      {/* OAuth re-auth path — visible only when the user has Google
          linked. Re-authenticates the user against a different Google
          account; the verified email Google returns becomes their
          new account email. */}
      {methods.hasGoogle && (
        <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-4">
          <label className="text-[12px] font-medium text-zinc-300">
            change email via google
          </label>
          <button
            type="button"
            onClick={onGoogleReAuth}
            disabled={state.kind === 'pending'}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.08] disabled:opacity-40"
          >
            open google · sign in with the new email
          </button>
          <p className="text-[11px] text-zinc-500">
            you&apos;ll be sent to google to pick the account whose email you
            want on holymog. the email change happens automatically once
            google returns — your current session stays signed in.
          </p>
        </div>
      )}

      {state.kind === 'saved' && (
        <div className="border-t border-white/5 px-4 py-3">
          <p className="text-[12px] text-white">
            email updated. check your inbox if you used the magic-link path.
          </p>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="border-t border-white/5 px-4 py-3">
          <p className="text-[12px] text-red-400">{state.message}</p>
        </div>
      )}
    </Section>
  );
}

// ---- Connected accounts ---------------------------------------------------

function ConnectedAccountsBlock() {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [hasEmailAuth, setHasEmailAuth] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    provider: string;
    label: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/account/connected-accounts', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        accounts: ConnectedAccount[];
        has_email_auth: boolean;
      };
      setAccounts(data.accounts);
      setHasEmailAuth(data.has_email_auth);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---- Add a method --------------------------------------------------------

  const addGoogle = useCallback(() => {
    setPending('add-google');
    setError(null);
    // signIn redirects out to Google's OAuth consent screen. On
    // callback, Auth.js sees the verified Google email matches the
    // user's existing email and links the accounts via
    // allowDangerousEmailAccountLinking (lib/auth.ts). The callback
    // lands back on /account?tab=settings so the user sees the new
    // "google · active" row.
    void signIn('google', { callbackUrl: '/account?tab=settings' });
  }, []);

  const addMagicLink = useCallback(async () => {
    if (!user?.email) {
      setError('your account has no email address to send a magic link to');
      return;
    }
    setPending('add-email');
    setError(null);
    setMagicLinkSent(false);
    try {
      const res = await signIn('nodemailer', {
        email: user.email,
        redirect: false,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.url && /\/api\/auth\/signin/.test(res.url)) {
        setError('email sign-in is not configured');
        return;
      }
      setMagicLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send failed');
    } finally {
      setPending(null);
    }
  }, [user?.email]);

  // ---- Remove a method -----------------------------------------------------

  const doUnlink = useCallback(async () => {
    if (!unlinkTarget) return;
    const provider = unlinkTarget.provider;
    setPending(`unlink-${provider}`);
    setUnlinkTarget(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/connected-accounts/${provider}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(
          data.error === 'last_signin_method'
            ? data.message ?? 'last sign-in method'
            : data.error ?? 'failed',
        );
        return;
      }
      await refresh();
    } finally {
      setPending(null);
    }
  }, [unlinkTarget, refresh]);

  if (!loaded) {
    return (
      <Section
        id="connected-accounts"
        label="connected accounts"
        description="how you sign in to holymog."
        icon={Plug}
        accent="violet"
      >
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          loading…
        </div>
      </Section>
    );
  }

  const hasGoogle = accounts.some((a) => a.provider === 'google');
  const hasApple = accounts.some((a) => a.provider === 'apple');
  // Count usable methods so we can tell the user (and pre-empt the
  // server) when "remove" would lock them out.
  const methodCount =
    (hasEmailAuth ? 1 : 0) + accounts.length;
  const isOnlyMethod = methodCount <= 1;

  return (
    <>
      <Section
        id="connected-accounts"
        label="connected accounts"
        description="how you sign in to holymog. you need at least one — adding a second is your backup if the first ever breaks."
        icon={Plug}
        accent="violet"
      >
        <AuthMethodRow
          label="magic link email"
          sub={user?.email ?? null}
          active={hasEmailAuth}
          pending={pending === 'add-email' || pending === 'unlink-email'}
          onAdd={addMagicLink}
          onRemove={() =>
            setUnlinkTarget({ provider: 'email', label: 'magic link email' })
          }
          isOnlyMethod={hasEmailAuth && isOnlyMethod}
          inlineNotice={
            magicLinkSent
              ? 'sent — click the link in your inbox to finish adding'
              : null
          }
        />
        {GOOGLE_ENABLED && (
          <AuthMethodRow
            label="google"
            sub={null}
            active={hasGoogle}
            pending={pending === 'add-google' || pending === 'unlink-google'}
            onAdd={addGoogle}
            onRemove={() =>
              setUnlinkTarget({ provider: 'google', label: 'google' })
            }
            isOnlyMethod={hasGoogle && isOnlyMethod}
          />
        )}
        {APPLE_ENABLED && (
          <AuthMethodRow
            label="apple"
            sub={null}
            active={hasApple}
            pending={pending === 'unlink-apple'}
            // No add for Apple yet — the front-end signIn redirect works
            // but the Apple OAuth config flow is gated behind the Apple
            // developer account being configured server-side. Wire when
            // AUTH_APPLE_ID / SECRET are populated.
            onAdd={() => {
              setPending('add-apple');
              void signIn('apple', { callbackUrl: '/account?tab=settings' });
            }}
            onRemove={() =>
              setUnlinkTarget({ provider: 'apple', label: 'apple' })
            }
            isOnlyMethod={hasApple && isOnlyMethod}
          />
        )}
        {error && (
          <div className="border-t border-white/5 px-4 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}
      </Section>

      <ConfirmModal
        open={unlinkTarget !== null}
        danger
        title={`Remove ${unlinkTarget?.label ?? ''}?`}
        description={
          <>
            You won&apos;t be able to sign in with{' '}
            <strong>{unlinkTarget?.label}</strong> anymore. You can re-add it
            later from this same page.
          </>
        }
        confirmLabel="Remove"
        onConfirm={doUnlink}
        onCancel={() => setUnlinkTarget(null)}
      />
    </>
  );
}

function AuthMethodRow({
  label,
  sub,
  active,
  pending,
  onAdd,
  onRemove,
  isOnlyMethod,
  inlineNotice,
}: {
  label: string;
  sub: string | null;
  active: boolean;
  pending: boolean;
  onAdd: () => void;
  onRemove: () => void;
  isOnlyMethod: boolean;
  inlineNotice?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.015]">
      <div className="flex min-w-0 flex-col">
        <span className="text-[14px] capitalize text-zinc-200">{label}</span>
        {sub && (
          <span className="truncate text-[11px] text-zinc-500">{sub}</span>
        )}
        {!active && (
          <span className="text-[11px] text-zinc-500">not connected</span>
        )}
        {inlineNotice && (
          <span className="text-[11px] text-white">{inlineNotice}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {active ? (
          <>
            <span className="text-[11px] text-white">active</span>
            <button
              type="button"
              onClick={onRemove}
              disabled={pending || isOnlyMethod}
              className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? '…' : 'remove'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={pending}
            className="rounded-sm bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-colors hover:opacity-90 disabled:opacity-40"
          >
            {pending ? '…' : 'add'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Active sessions ------------------------------------------------------

function ActiveSessionsBlock() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/account/sessions', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: SessionItem[] };
      setSessions(data.sessions);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onKick = useCallback(
    async (id: string) => {
      setKicking(id);
      try {
        const res = await fetch(`/api/account/sessions/${id}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          await refresh();
        }
      } finally {
        setKicking(null);
      }
    },
    [refresh],
  );

  const [kickOpen, setKickOpen] = useState(false);
  const doKickOthers = useCallback(async () => {
    setKickOpen(false);
    const res = await fetch('/api/account/sessions', { method: 'DELETE' });
    if (res.ok) {
      await refresh();
    }
  }, [refresh]);
  const onKickOthers = useCallback(() => setKickOpen(true), []);

  if (!loaded) {
    return (
      <Section
        id="sessions"
        label="active sessions"
        description="every device signed into your account."
        icon={Monitor}
        accent="teal"
      >
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          loading…
        </div>
      </Section>
    );
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
    <Section
      id="sessions"
      label="active sessions"
      description="every device signed into your account."
      icon={Monitor}
      accent="teal"
      meta={
        others > 0 ? (
          <button
            type="button"
            onClick={onKickOthers}
            className="rounded-sm border border-red-500/30 bg-red-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/[0.12]"
          >
            kick others
          </button>
        ) : null
      }
    >
      {sessions.length === 0 && (
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          no sessions
        </div>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.015]"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-[14px] text-zinc-200">
              {s.current ? 'this device' : 'other session'}
            </span>
            <span className="font-num text-[11px] tabular-nums text-zinc-500">
              expires {formatExpires(s.expires_at)}
            </span>
          </div>
          {!s.current && (
            <button
              type="button"
              onClick={() => void onKick(s.id)}
              disabled={kicking === s.id}
              className="rounded-sm border border-red-500/30 bg-red-500/[0.04] px-3 py-1.5 text-[11px] text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:opacity-40"
            >
              {kicking === s.id ? 'kicking…' : 'kick'}
            </button>
          )}
        </div>
      ))}
    </Section>
    <ConfirmModal
      open={kickOpen}
      title="Sign out other devices?"
      description="Every session except this device will be ended. They'll need to sign in again."
      confirmLabel="Sign them out"
      danger
      onConfirm={doKickOthers}
      onCancel={() => setKickOpen(false)}
    />
    </>
  );
}

function formatExpires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = d.getTime() - Date.now();
  if (diffMs < 0) return 'expired';
  const days = Math.round(diffMs / 86_400_000);
  if (days >= 1) return `in ${days}d`;
  const hours = Math.round(diffMs / 3_600_000);
  return `in ${hours}h`;
}

// ---- Two-factor authentication --------------------------------------------

function TwoFactorBlock({ initialEnabled }: { initialEnabled: boolean }) {
  const { user } = useUser();
  const [status, setStatus] = useState<TwoFactorStatus>(
    initialEnabled ? 'enabled' : 'not-enabled',
  );
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const startSetup = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/account/2fa/setup', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? 'failed');
        return;
      }
      const data = (await res.json()) as { secret: string; uri: string };
      setSetupSecret(data.secret);
      setSetupUri(data.uri);
      setStatus('setting-up');
    } finally {
      setPending(false);
    }
  }, []);

  const verifySetup = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/account/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          data.error === 'wrong_code' ? 'wrong code' : data.error ?? 'failed',
        );
        return;
      }
      const data = (await res.json()) as { backup_codes: string[] };
      setBackupCodes(data.backup_codes);
      setStatus('enabled');
      setCode('');
    } finally {
      setPending(false);
    }
  }, [code]);

  const [disableOpen, setDisableOpen] = useState(false);
  const doDisable = useCallback(
    async (entered?: string) => {
      if (!entered) return;
      setDisableOpen(false);
      setPending(true);
      setError(null);
      try {
        const res = await fetch('/api/account/2fa/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: entered }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(
            data.error === 'wrong_code' ? 'wrong code' : data.error ?? 'failed',
          );
          return;
        }
        setStatus('not-enabled');
        setBackupCodes(null);
        setSetupSecret(null);
        setSetupUri(null);
      } finally {
        setPending(false);
      }
    },
    [],
  );
  const disable = useCallback(() => setDisableOpen(true), []);

  const copySecret = useCallback(() => {
    if (setupSecret) void navigator.clipboard.writeText(setupSecret);
  }, [setupSecret]);

  return (
    <>
    <Section
      id="2fa"
      label="two-factor auth"
      description="require a code from an authenticator app on every sign-in."
      icon={ShieldCheck}
      accent="fuchsia"
      meta={
        status === 'enabled' ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-white">
            <ShieldCheck size={11} aria-hidden /> enabled
          </span>
        ) : null
      }
    >
      {status === 'not-enabled' && (
        <div className="flex items-center justify-between gap-4 border-t border-white/5 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            adds a second factor on top of your email / oauth sign-in. uses any{' '}
            <span className="uppercase">totp</span> app.
          </p>
          <button
            type="button"
            onClick={startSetup}
            disabled={pending}
            className="rounded-sm bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_0_2px_rgba(255,255,255,0.20)] disabled:opacity-40 disabled:hover:shadow-none"
          >
            {pending ? 'starting…' : 'set up'}
          </button>
        </div>
      )}

      {status === 'setting-up' && setupSecret && setupUri && (
        <div className="flex flex-col gap-4 border-t border-white/5 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            scan this <span className="uppercase">qr</span> with your authenticator app
            (1password, authy, google authenticator, bitwarden…). then enter the 6-digit
            code below to confirm.
          </p>
          <div className="flex flex-col items-center gap-3">
            <TotpQrCode uri={setupUri} />
            <a
              href={setupUri}
              className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.06]"
            >
              <KeyRound size={11} aria-hidden /> open in authenticator app
            </a>
            <details className="w-full">
              <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                can&apos;t scan? show secret to type manually
              </summary>
              <div className="mt-2 flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <code className="flex-1 truncate font-num text-[13px] tabular-nums uppercase text-white">
                  {formatSecretGroups(setupSecret)}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.07]"
                >
                  <Copy size={11} aria-hidden /> copy
                </button>
              </div>
            </details>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="font-num flex-1 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-lg tabular-nums text-white tracking-[0.3em] placeholder:text-zinc-600 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/15"
            />
            <button
              type="button"
              onClick={verifySetup}
              disabled={code.length !== 6 || pending}
              className="rounded-sm bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-40"
            >
              {pending ? 'verifying…' : 'verify'}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}

      {status === 'enabled' && (
        <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-4">
          {backupCodes && (
            <div className="rounded-sm border border-white/40 bg-white/[0.04] p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-white">
                <AlertTriangle size={12} aria-hidden /> save your backup codes
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-white/70">
                each code works once if you lose your authenticator. we
                won&apos;t show them again — store them somewhere safe.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-num text-[13px] tabular-nums text-white">
                {backupCodes.map((c) => (
                  <code
                    key={c}
                    className="select-all rounded-sm border border-white/20 bg-black/40 px-2 py-1.5 text-center uppercase"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBackupCodes(null)}
                className="mt-3 inline-flex items-center gap-1 text-[11px] text-white/70 hover:text-white"
              >
                <Check size={11} aria-hidden /> i&apos;ve saved them
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              {user?.email ?? 'your account'} is protected. enrolment applies to future sign-ins; we&apos;ll prompt for a code on every new session.
            </p>
            <button
              type="button"
              onClick={disable}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-sm border border-red-500/30 bg-red-500/[0.04] px-3 py-1.5 text-[11px] text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:opacity-40"
            >
              <X size={11} aria-hidden /> disable
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </Section>
    <ConfirmModal
      open={disableOpen}
      danger
      title="Disable two-factor auth?"
      description="Enter your current 2FA code (or a backup code) to confirm. Without 2FA your account is protected only by your sign-in method."
      confirmLabel="Disable 2FA"
      input={{
        placeholder: '123456',
        inputMode: 'numeric',
        autoComplete: 'one-time-code',
        minLength: 6,
      }}
      busy={pending}
      onConfirm={(typed) => void doDisable(typed)}
      onCancel={() => setDisableOpen(false)}
    />
    </>
  );
}

function formatSecretGroups(secret: string): string {
  // Group into 4-char chunks for readability.
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Renders the otpauth:// URI as a scannable QR. `qrcode` is loaded via
 * dynamic import so it isn't bundled into the main settings chunk —
 * only users who actually open the 2FA setup flow pay the parse cost.
 *
 * Light/dark palette is hard-coded for legibility: dark modules on a
 * white background scans most reliably across phone-camera apps, even
 * inside a dark UI surrounding it.
 */
function TotpQrCode({ uri }: { uri: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QR = (await import('qrcode')).default;
        const url = await QR.toDataURL(uri, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
          color: { dark: '#0a0a0a', light: '#ffffff' },
        });
        if (!cancelled) setDataUrl(url);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'qr_render_failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (err) {
    return (
      <p className="text-[11px] text-red-400">
        couldn&apos;t render qr — type the secret instead
      </p>
    );
  }
  if (!dataUrl) {
    return (
      <div className="flex h-[220px] w-[220px] items-center justify-center rounded-sm border border-white/10 bg-white/[0.02]">
        <Loader2 size={18} className="animate-spin text-zinc-500" aria-hidden />
      </div>
    );
  }
  // Inline <img> intentionally — Next/Image would force a route-level
  // optimisation pass on a base64 data URL which doesn't help.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="2FA QR code"
      width={220}
      height={220}
      className="rounded-sm border border-white/10 bg-white"
    />
  );
}
