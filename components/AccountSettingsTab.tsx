'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { ProfileSection } from './account/settings/ProfileSection';
import { PrivacySection } from './account/settings/PrivacySection';
import { BattleSection } from './account/settings/BattleSection';
import { NotificationsSection } from './account/settings/NotificationsSection';
import { CustomizationSection } from './account/settings/CustomizationSection';
import { AccountSection } from './account/settings/AccountSection';
import { DataSection } from './account/settings/DataSection';
import { HelpSection } from './account/settings/HelpSection';
import { PromoteBestScanModal } from './PromoteBestScanModal';
import type { FieldUpdate, SettingsProfile } from './account/settings/shared';

/**
 * Account settings tab — composes per-domain sections (profile,
 * privacy, battle, notifications, data, help). Each section reads its
 * slice of the profile and writes back through the shared `updateProfile`
 * helper, which optimistically applies the patch then talks to
 * /api/account/me PATCH. Fully self-contained — only the tab nav above
 * is owned by the parent /account page.
 */

type ServerProfile = SettingsProfile & {
  display_name: string;
  // Optional best_scan_overall is read off /api/account/me's profile
  // payload (the canonical source). SettingsProfile itself doesn't
  // carry it because every other section in this tab ignores it —
  // only the promote-best-scan modal trigger needs it.
  best_scan_overall?: number | null;
};

type LeaderboardEntryShape = {
  id: string;
  overall?: number;
  image_url?: string | null;
};

type MeResponse = {
  profile?: ServerProfile | null;
  entry?: LeaderboardEntryShape | null;
};

export function AccountSettingsTab({
  initial,
  onRefresh,
}: {
  initial?: MeResponse | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const { user } = useUser();
  const [profile, setProfile] = useState<ServerProfile | null>(
    initial?.profile ?? null,
  );
  const [hasLeaderboardEntry, setHasLeaderboardEntry] = useState<boolean>(
    !!initial?.entry,
  );
  const [hasLeaderboardPhoto, setHasLeaderboardPhoto] = useState<boolean>(
    !!initial?.entry?.image_url,
  );
  const [entryOverall, setEntryOverall] = useState<number | null>(
    typeof initial?.entry?.overall === 'number' ? initial.entry.overall : null,
  );
  const [loaded, setLoaded] = useState(initial != null);
  // Tri-state dismissal lifecycle for the promote-best prompt:
  //   - 'pending'   — sessionStorage hasn't been read yet (initial render
  //                   on SSR / first client render). Modal stays hidden
  //                   so we don't flash it before checking the flag.
  //   - 'live'      — flag absent, mismatch (if any) opens the modal.
  //   - 'dismissed' — user clicked "Not now" this session, OR the flag
  //                   was already set from a previous open. Modal hidden
  //                   until next browser session.
  // Derived render avoids the open-state effect → render → effect-runs-
  // again loop that the first cut had, which was popping the modal then
  // immediately re-triggering on every parent re-render.
  const [dismissalState, setDismissalState] =
    useState<'pending' | 'live' | 'dismissed'>('pending');

  // Hydrate from server if the page didn't prefetch.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/account/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as MeResponse;
      if (data.profile) setProfile(data.profile);
      setHasLeaderboardEntry(!!data.entry);
      setHasLeaderboardPhoto(!!data.entry?.image_url);
      setEntryOverall(
        typeof data.entry?.overall === 'number' ? data.entry.overall : null,
      );
    } catch {
      // best-effort
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (initial != null) return;
    void refresh();
  }, [user?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local profile state when the parent re-fetches /api/account/me
  // (e.g. after a username change). Without this, the inline username
  // editor view in ProfileSection keeps reading the OLD display_name
  // through props even though every other surface on the page has
  // already updated, because useState only honours the initial value
  // on first mount.
  useEffect(() => {
    if (!initial) return;
    if (initial.profile) setProfile(initial.profile);
    setHasLeaderboardEntry(!!initial.entry);
    setHasLeaderboardPhoto(!!initial.entry?.image_url);
    setEntryOverall(
      typeof initial.entry?.overall === 'number' ? initial.entry.overall : null,
    );
  }, [initial]);

  // One-time read of the sessionStorage dismissal flag. Runs after
  // hydration so client + server first render match (server has no
  // sessionStorage, so the flag stays in 'pending' on SSR). Re-runs
  // only when the user id changes — i.e. sign-out / different user.
  useEffect(() => {
    if (!user) {
      setDismissalState('live');
      return;
    }
    try {
      const flag = window.sessionStorage.getItem(
        `holymog:promote-prompt-dismissed:${user.id}`,
      );
      setDismissalState(flag ? 'dismissed' : 'live');
    } catch {
      // private mode / quota — treat as live; worst case the modal
      // re-shows next session, which is the existing fallback.
      setDismissalState('live');
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissPromote = useCallback(() => {
    if (user) {
      try {
        window.sessionStorage.setItem(
          `holymog:promote-prompt-dismissed:${user.id}`,
          '1',
        );
      } catch {
        // ignore
      }
    }
    setDismissalState('dismissed');
  }, [user]);

  const onPromoted = useCallback(() => {
    // Successful publish — close the modal optimistically via the
    // derived state. We deliberately do NOT set the sessionStorage
    // "dismissed" flag here: that one is reserved for the explicit
    // "Not now" path so a user who later scans an even higher score
    // gets re-prompted on their next browser session. The outer
    // conditional will also hide the modal once refresh settles
    // entry.overall to match the new best — this is the snappy
    // visual close before that refetch lands.
    setDismissalState('dismissed');
    void refresh();
    if (onRefresh) void onRefresh();
  }, [refresh, onRefresh]);

  // Patches go through here; we apply optimistically so toggles feel
  // instant, then roll back on error.
  const updateProfile = useCallback(
    async (
      patch: FieldUpdate,
    ): Promise<{ ok: boolean; error?: string; message?: string }> => {
      if (!profile) return { ok: false, error: 'no_profile' };
      const previous = profile;
      // Apply locally — translate the wire shape (FieldUpdate) into the
      // SettingsProfile shape. socials in patches contains only the
      // changed slots; merge into the existing socials object.
      const optimistic: ServerProfile = { ...previous };
      for (const key of [
        'bio',
        'location',
        'hide_photo_from_leaderboard',
        'hide_elo',
        'mute_battle_sfx',
        'weekly_digest',
        'mog_email_alerts',
      ] as const) {
        if (key in patch) {
          // @ts-expect-error — same shape on both sides.
          optimistic[key] = patch[key];
        }
      }
      if (patch.socials) {
        const merged: Record<string, string | null> = {
          ...((previous.socials as Record<string, string | null> | null) ?? {}),
        };
        for (const [k, v] of Object.entries(patch.socials)) {
          if (v === '' || v === null) delete merged[k];
          else merged[k] = v;
        }
        optimistic.socials = merged;
      }
      setProfile(optimistic);

      try {
        const res = await fetch('/api/account/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          // Revert on failure.
          setProfile(previous);
          return { ok: false, error: data.error, message: data.message };
        }
        // Tell the parent page to refetch /api/account/me so anything
        // outside this tab (header chip, public profile link, etc) sees
        // the new value without a full reload.
        if (onRefresh) void onRefresh();
        return { ok: true };
      } catch {
        setProfile(previous);
        return { ok: false, error: 'network_error' };
      }
    },
    [profile, onRefresh],
  );

  // Danger-zone callbacks for DataSection — wrap fetches in a stable shape.
  const onResetStats = useCallback(async () => {
    try {
      const res = await fetch('/api/account/reset-stats', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return { ok: false, message: data.error ?? 'failed' };
      }
      void refresh();
      return { ok: true };
    } catch {
      return { ok: false, message: 'network error' };
    }
  }, [refresh]);

  const onRemoveLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/account/leaderboard', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return { ok: false, message: data.error ?? 'failed' };
      }
      setHasLeaderboardEntry(false);
      return { ok: true };
    } catch {
      return { ok: false, message: 'network error' };
    }
  }, []);

  const onDeleteAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account/me', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return { ok: false, message: data.error ?? 'failed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: 'network error' };
    }
  }, []);

  if (!user || !loaded) return null;
  if (!profile) {
    return (
      <div className="border-2 border-white/20 bg-black p-3 text-center text-[11px] uppercase tracking-[0.18em] text-white/50" style={{ borderRadius: 2 }}>
        COULD NOT LOAD PROFILE
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileSection
        profile={profile}
        onUpdate={updateProfile}
        onRefresh={onRefresh}
      />
      <CustomizationSection profile={profile} onRefresh={onRefresh} />
      <PrivacySection
        profile={profile}
        hasLeaderboardPhoto={hasLeaderboardPhoto}
        onUpdate={updateProfile}
      />
      <BattleSection profile={profile} onUpdate={updateProfile} />
      <NotificationsSection profile={profile} onUpdate={updateProfile} />
      <AccountSection
        twoFactorEnabled={profile.two_factor_enabled}
        email={user.email}
      />
      <DataSection
        hasLeaderboardEntry={hasLeaderboardEntry}
        onResetStats={onResetStats}
        onRemoveLeaderboard={onRemoveLeaderboard}
        onDeleteAccount={onDeleteAccount}
      />
      <HelpSection />

      {/* Mismatch prompt — fires once per session when the user's
          all-time best beats their published leaderboard entry.
          Open state is derived (loaded + mismatch + not-yet-dismissed)
          so there's no setPromoteOpen call inside a useEffect that
          could re-fire on every parent re-render. dismissalState
          starts 'pending' until the post-mount sessionStorage read
          settles, which keeps the modal hidden on first paint and
          avoids the "flash + close" loop the first cut had. */}
      {entryOverall !== null &&
        typeof profile.best_scan_overall === 'number' &&
        profile.best_scan_overall > entryOverall && (
          <PromoteBestScanModal
            open={dismissalState === 'live'}
            bestOverall={profile.best_scan_overall}
            publishedOverall={entryOverall}
            hadPhoto={hasLeaderboardPhoto}
            onClose={dismissPromote}
            onPromoted={onPromoted}
          />
        )}
    </div>
  );
}
