'use client';

import { useCallback, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  SaveIndicator,
  Section,
  Toggle,
  ToggleRow,
  type FieldUpdate,
  type SaveState,
  type SettingsProfile,
  useAutoIdle,
} from './shared';

/**
 * Privacy section. Two server-respected toggles:
 *   - `hide_photo_from_leaderboard` — only nullifies the user's
 *     SUBMITTED leaderboard photo (the face they actively shared on
 *     the scan board). Profile picture is unaffected — that's
 *     identity, not the submission. Greyed-out when there's no
 *     leaderboard photo to hide.
 *   - `hide_elo` — hides ELO + peak + win rate on the public profile
 *     and removes the user from the public ELO leaderboard.
 */
export function PrivacySection({
  profile,
  hasLeaderboardPhoto,
  onUpdate,
}: {
  profile: SettingsProfile;
  hasLeaderboardPhoto: boolean;
  onUpdate: (
    patch: FieldUpdate,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  useAutoIdle(state, setState);

  const apply = useCallback(
    async (patch: FieldUpdate) => {
      setState({ kind: 'pending' });
      const res = await onUpdate(patch);
      if (res.ok) setState({ kind: 'saved' });
      else
        setState({
          kind: 'error',
          message: res.message ?? res.error ?? 'failed',
        });
    },
    [onUpdate],
  );

  return (
    <Section
      id="privacy"
      label="privacy"
      description="control what other people see about you."
      icon={Lock}
      accent="amber"
      meta={<SaveIndicator state={state} />}
    >
      <PhotoToggleRow
        on={profile.hide_photo_from_leaderboard}
        hasPhoto={hasLeaderboardPhoto}
        saving={state.kind === 'pending'}
        onChange={(next) =>
          void apply({ hide_photo_from_leaderboard: next })
        }
      />
      <ToggleRow
        label="hide my elo publicly"
        helperText="your elo, peak elo, and win rate stay private. you still see them in settings."
        on={profile.hide_elo}
        onChange={(next) => void apply({ hide_elo: next })}
        saving={state.kind === 'pending'}
      />
    </Section>
  );
}

/**
 * Specialised version of ToggleRow for the leaderboard photo toggle —
 * greyed out and explains the no-op when the user hasn't submitted a
 * scan to the leaderboard. Forces the toggle off in that state so
 * stale `true` values don't quietly persist on accounts that have
 * since cleared their entry.
 */
function PhotoToggleRow({
  on,
  hasPhoto,
  saving,
  onChange,
}: {
  on: boolean;
  hasPhoto: boolean;
  saving?: boolean;
  onChange: (next: boolean) => void;
}) {
  const disabled = !hasPhoto;
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.015]">
      <div className="flex-1 min-w-0">
        <div
          className={`text-[14px] font-medium ${
            disabled ? 'text-zinc-500' : 'text-white'
          }`}
        >
          hide my scan photo from the leaderboard
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
          {hasPhoto
            ? 'removes the face image you submitted to the public scan board. your profile picture stays where it is.'
            : "you haven't submitted a scan photo to the leaderboard yet — nothing to hide."}
        </p>
      </div>
      <Toggle
        on={hasPhoto && on}
        onChange={onChange}
        disabled={disabled || saving}
        ariaLabel="hide my scan photo from the leaderboard"
      />
    </div>
  );
}
