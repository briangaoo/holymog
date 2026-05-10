'use client';

import { useCallback, useState } from 'react';
import { AtSign } from 'lucide-react';
import {
  SaveIndicator,
  Section,
  type SaveState,
  type SettingsProfile,
  useAutoIdle,
} from './shared';

const USERNAME_REGEX = /^[a-z0-9_-]{3,24}$/;

/**
 * Username section — separated from ProfileSection because the
 * username has its own server-side rate limit (3/h) and unique
 * collision check, so its save flow is meaningfully different. On
 * success, hard-reload the page so every other component picks up the
 * new handle (header pill, leaderboard chip, history rows).
 */
export function UsernameSection({
  profile,
}: {
  profile: SettingsProfile;
}) {
  const [username, setUsername] = useState(profile.display_name);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  useAutoIdle(state, setState);

  const dirty = username.trim() !== profile.display_name.trim();
  const valid = USERNAME_REGEX.test(username.trim());

  const onSave = useCallback(async () => {
    const value = username.trim();
    if (!USERNAME_REGEX.test(value)) {
      setState({ kind: 'error', message: '3–24 chars · a-z 0-9 _ -' });
      return;
    }
    setState({ kind: 'pending' });
    try {
      const res = await fetch('/api/account/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const msg =
          data.error === 'username_taken'
            ? 'username taken'
            : data.error === 'username_reserved'
              ? 'reserved'
              : data.error === 'rate_limited'
                ? 'try again later'
                : data.message ?? 'could not save';
        setState({ kind: 'error', message: msg });
        return;
      }
      setState({ kind: 'saved' });
      // Brief pause so the "saved" pip flashes, then hard-reload — every
      // place that displays the handle (battles, leaderboard, history)
      // re-renders without bespoke refresh wiring.
      window.setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch {
      setState({ kind: 'error', message: 'network error' });
    }
  }, [username]);

  return (
    <Section
      id="username"
      label="username"
      description="your handle on the leaderboard, in battles, and at /account/[you]."
      icon={AtSign}
      accent="violet"
      meta={<SaveIndicator state={state} />}
    >
      <div className="flex items-stretch gap-2 border-t border-white/5 px-4 py-4">
        <input
          type="text"
          value={username}
          onChange={(e) => {
            const sanitized = e.target.value
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, '')
              .slice(0, 24);
            setUsername(sanitized);
            if (state.kind !== 'idle') setState({ kind: 'idle' });
          }}
          placeholder="briangao"
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
          style={{ textTransform: 'lowercase' }}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || !valid || state.kind === 'pending'}
          className="rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_0_2px_rgba(167,139,250,0.20)] disabled:opacity-40 disabled:hover:shadow-none"
        >
          {state.kind === 'pending' ? 'saving…' : 'save'}
        </button>
      </div>
      <div className="border-t border-white/5 px-4 py-2.5">
        <span className="text-[11px] text-zinc-500">
          3–24 characters · letters, numbers, _, -
        </span>
      </div>
    </Section>
  );
}
