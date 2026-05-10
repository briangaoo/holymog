'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { ProfileSection } from './account/settings/ProfileSection';
import { UsernameSection } from './account/settings/UsernameSection';
import { PrivacySection } from './account/settings/PrivacySection';
import { BattleSection } from './account/settings/BattleSection';
import { NotificationsSection } from './account/settings/NotificationsSection';
import { CustomizationSection } from './account/settings/CustomizationSection';
import { AccountSection } from './account/settings/AccountSection';
import { DataSection } from './account/settings/DataSection';
import { HelpSection } from './account/settings/HelpSection';
import type { FieldUpdate, SettingsProfile } from './account/settings/shared';

/**
 * Account settings tab — composes per-domain sections (profile, username,
 * privacy, battle, notifications, data, help). Each section reads its
 * slice of the profile and writes back through the shared `updateProfile`
 * helper, which optimistically applies the patch then talks to
 * /api/account/me PATCH. Fully self-contained — only the tab nav above
 * is owned by the parent /account page.
 */

type ServerProfile = SettingsProfile & {
  display_name: string;
};

type LeaderboardEntryShape = {
  id: string;
  image_url?: string | null;
};

type MeResponse = {
  profile?: ServerProfile | null;
  entry?: LeaderboardEntryShape | null;
};

export function AccountSettingsTab({ initial }: { initial?: MeResponse | null }) {
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
  const [loaded, setLoaded] = useState(initial != null);

  // Hydrate from server if the page didn't prefetch.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/account/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as MeResponse;
      if (data.profile) setProfile(data.profile);
      setHasLeaderboardEntry(!!data.entry);
      setHasLeaderboardPhoto(!!data.entry?.image_url);
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
        return { ok: true };
      } catch {
        setProfile(previous);
        return { ok: false, error: 'network_error' };
      }
    },
    [profile],
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
      <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-center text-xs text-zinc-400">
        could not load profile
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileSection profile={profile} onUpdate={updateProfile} />
      <UsernameSection profile={profile} />
      <PrivacySection
        profile={profile}
        hasLeaderboardPhoto={hasLeaderboardPhoto}
        onUpdate={updateProfile}
      />
      <BattleSection profile={profile} onUpdate={updateProfile} />
      <NotificationsSection profile={profile} onUpdate={updateProfile} />
      <CustomizationSection profile={profile} />
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
    </div>
  );
}
