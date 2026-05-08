'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/hooks/useUser';

const MAX_NAME_LEN = 24;

export function AccountSettingsTab() {
  const { user, signOut } = useUser();
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Pull the canonical display name + identity from /api/account/me on mount.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { display_name?: string };
        };
        if (cancelled) return;
        const dn = data.profile?.display_name ?? '';
        setName(dn);
        setOriginalName(dn);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveName = async () => {
    const trimmed = name.trim().toLowerCase().slice(0, MAX_NAME_LEN);
    if (!trimmed || !user) return;
    setSavingName(true);
    setNameStatus('idle');
    try {
      const res = await fetch('/api/account/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      });
      setSavingName(false);
      if (!res.ok) {
        setNameStatus('error');
        return;
      }
      setNameStatus('saved');
      setName(trimmed);
      setOriginalName(trimmed);
      window.setTimeout(() => setNameStatus('idle'), 1500);
    } catch {
      setSavingName(false);
      setNameStatus('error');
    }
  };

  if (!user) {
    return <p className="text-sm text-zinc-500">not signed in</p>;
  }

  const isDirty = name.trim() !== originalName.trim();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <label
          htmlFor="display-name"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) =>
              setName(e.target.value.toLowerCase().slice(0, MAX_NAME_LEN))
            }
            maxLength={MAX_NAME_LEN}
            className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="your name"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={savingName || !isDirty || name.trim().length === 0}
            style={{ touchAction: 'manipulation' }}
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            {savingName ? 'saving…' : 'save'}
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">e.g. brian gao</p>
        {nameStatus === 'saved' && (
          <p className="text-[11px] text-emerald-400">saved</p>
        )}
        {nameStatus === 'error' && (
          <p className="text-[11px] text-red-400">could not save</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <button
          type="button"
          onClick={signOut}
          style={{ touchAction: 'manipulation' }}
          className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.07]"
        >
          sign out
        </button>
      </section>
    </div>
  );
}
