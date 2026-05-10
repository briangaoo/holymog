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
import { useUser } from '@/hooks/useUser';
import { Section, type SaveState, useAutoIdle } from './shared';

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
  useAutoIdle(state, setState, 4000);

  const dirty = next.trim().length > 0 && next.trim().toLowerCase() !== (email ?? '').toLowerCase();

  const onSubmit = useCallback(async () => {
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
      window.alert(
        `verification link sent to ${next.trim().toLowerCase()}. click it to complete the change.`,
      );
    } catch {
      setState({ kind: 'error', message: 'network error' });
    }
  }, [next]);

  return (
    <Section
      id="email"
      label="email"
      description="address used for sign-in, alerts, and digests."
      icon={Mail}
      accent="purple"
    >
      <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
        <span className="flex-1 truncate text-[14px] text-zinc-200">
          {email ?? <span className="text-zinc-500">no email on file</span>}
        </span>
        <span className="text-[11px] text-zinc-500">current</span>
      </div>
      <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-4">
        <label
          htmlFor="new-email"
          className="text-[12px] font-medium text-zinc-300"
        >
          change email
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
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!dirty || state.kind === 'pending'}
            className="rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_0_2px_rgba(168,85,247,0.20)] disabled:opacity-40 disabled:hover:shadow-none"
          >
            {state.kind === 'pending' ? 'sending…' : 'send link'}
          </button>
        </div>
        {state.kind === 'saved' && (
          <p className="text-[11px] text-emerald-400">
            verification link sent. click it from your inbox to complete.
          </p>
        )}
        {state.kind === 'error' && (
          <p className="text-[11px] text-red-400">{state.message}</p>
        )}
        <p className="text-[11px] text-zinc-500">
          we&apos;ll send a verification link to the new address. the change
          only completes once you click it.
        </p>
      </div>
    </Section>
  );
}

// ---- Connected accounts ---------------------------------------------------

function ConnectedAccountsBlock() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [hasEmailAuth, setHasEmailAuth] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const onUnlink = useCallback(
    async (provider: string) => {
      setUnlinking(provider);
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
        setUnlinking(null);
      }
    },
    [refresh],
  );

  if (!loaded) {
    return (
      <Section
        id="connected-accounts"
        label="connected accounts"
        description="how you sign in to holymog."
        icon={Plug}
        accent="purple"
      >
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          loading…
        </div>
      </Section>
    );
  }

  return (
    <Section
      id="connected-accounts"
      label="connected accounts"
      description="how you sign in to holymog."
      icon={Plug}
      accent="purple"
    >
      {hasEmailAuth && (
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
          <span className="text-[14px] capitalize text-zinc-200">
            magic link email
          </span>
          <span className="text-[11px] text-emerald-400">active</span>
        </div>
      )}
      {accounts.length === 0 && !hasEmailAuth && (
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          no auth methods linked.
        </div>
      )}
      {accounts.map((a) => (
        <div
          key={a.provider}
          className="flex items-center justify-between border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.015]"
        >
          <div className="flex flex-col">
            <span className="text-[14px] capitalize text-zinc-200">
              {a.provider}
            </span>
            <span className="text-[11px] text-zinc-500">{a.type}</span>
          </div>
          <button
            type="button"
            onClick={() => void onUnlink(a.provider)}
            disabled={unlinking === a.provider}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            {unlinking === a.provider ? 'unlinking…' : 'unlink'}
          </button>
        </div>
      ))}
      {error && (
        <div className="border-t border-white/5 px-4 py-2 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </Section>
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

  const onKickOthers = useCallback(async () => {
    if (
      !window.confirm('Kick every other session except this device?')
    )
      return;
    const res = await fetch('/api/account/sessions', { method: 'DELETE' });
    if (res.ok) {
      await refresh();
    }
  }, [refresh]);

  if (!loaded) {
    return (
      <Section
        id="sessions"
        label="active sessions"
        description="every device signed into your account."
        icon={Monitor}
        accent="purple"
      >
        <div className="border-t border-white/5 px-4 py-3 text-[12px] text-zinc-500">
          loading…
        </div>
      </Section>
    );
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <Section
      id="sessions"
      label="active sessions"
      description="every device signed into your account."
      icon={Monitor}
      accent="purple"
      meta={
        others > 0 ? (
          <button
            type="button"
            onClick={onKickOthers}
            className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/[0.12]"
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
              className="rounded-lg border border-red-500/30 bg-red-500/[0.04] px-3 py-1.5 text-[11px] text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:opacity-40"
            >
              {kicking === s.id ? 'kicking…' : 'kick'}
            </button>
          )}
        </div>
      ))}
    </Section>
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

  const disable = useCallback(async () => {
    const entered = window.prompt(
      'Enter your current 2FA code (or a backup code) to disable.',
    );
    if (!entered) return;
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
  }, []);

  const copySecret = useCallback(() => {
    if (setupSecret) void navigator.clipboard.writeText(setupSecret);
  }, [setupSecret]);

  return (
    <Section
      id="2fa"
      label="two-factor auth"
      description="require a code from an authenticator app on every sign-in."
      icon={ShieldCheck}
      accent="purple"
      meta={
        status === 'enabled' ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <ShieldCheck size={11} aria-hidden /> enabled
          </span>
        ) : null
      }
    >
      {status === 'not-enabled' && (
        <div className="flex items-center justify-between gap-4 border-t border-white/5 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            adds a second factor on top of your email / oauth sign-in. uses any TOTP app.
          </p>
          <button
            type="button"
            onClick={startSetup}
            disabled={pending}
            className="rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_0_2px_rgba(168,85,247,0.20)] disabled:opacity-40 disabled:hover:shadow-none"
          >
            {pending ? 'starting…' : 'set up'}
          </button>
        </div>
      )}

      {status === 'setting-up' && setupSecret && setupUri && (
        <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            scan or paste this secret into your authenticator app
            (1password, authy, google authenticator, bitwarden…). then
            enter the 6-digit code below to confirm.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <code className="flex-1 truncate font-num text-[13px] tabular-nums text-white">
              {formatSecretGroups(setupSecret)}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.07]"
            >
              <Copy size={11} aria-hidden /> copy
            </button>
          </div>
          <a
            href={setupUri}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-zinc-200 hover:bg-white/[0.06]"
          >
            <KeyRound size={11} aria-hidden /> open in authenticator app
          </a>
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
              className="font-num flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-lg tabular-nums text-white tracking-[0.3em] placeholder:text-zinc-600 focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15"
            />
            <button
              type="button"
              onClick={verifySetup}
              disabled={code.length !== 6 || pending}
              className="rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-40"
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
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-300">
                <AlertTriangle size={12} aria-hidden /> save your backup codes
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-amber-100/85">
                each code works once if you lose your authenticator. we
                won&apos;t show them again — store them somewhere safe.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-num text-[13px] tabular-nums text-amber-100">
                {backupCodes.map((c) => (
                  <code
                    key={c}
                    className="select-all rounded-lg border border-amber-500/20 bg-black/40 px-2 py-1.5 text-center"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBackupCodes(null)}
                className="mt-3 inline-flex items-center gap-1 text-[11px] text-amber-200 hover:text-amber-100"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-3 py-1.5 text-[11px] text-red-200 transition-colors hover:bg-red-500/[0.10] disabled:opacity-40"
            >
              <X size={11} aria-hidden /> disable
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </Section>
  );
}

function formatSecretGroups(secret: string): string {
  // Group into 4-char chunks for readability.
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
