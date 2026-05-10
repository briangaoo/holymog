'use client';

import { useCallback, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  SaveIndicator,
  Section,
  ToggleRow,
  type FieldUpdate,
  type SaveState,
  type SettingsProfile,
  useAutoIdle,
} from './shared';

/**
 * Notification preferences.
 *
 * - `weekly_digest`: Sunday 12:00 UTC summary of the user's stats this
 *   week (battles, win-rate delta, ELO delta, top moment) — wired in
 *   Phase 6 via the cron at /api/cron/weekly-digest.
 * - `mog_email_alerts`: hourly cron checks for top-N leaderboard
 *   displacement and emails affected users that they got mogged.
 *
 * Toggles persist immediately and write through to the
 * `email_preferences` table (canonical for the cron) plus the
 * `profiles` mirror columns the API exposes.
 */
export function NotificationsSection({
  profile,
  onUpdate,
}: {
  profile: SettingsProfile;
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
      id="notifications"
      label="notifications"
      description="when we email you, and when we don't."
      icon={Bell}
      accent="cyan"
      meta={<SaveIndicator state={state} />}
    >
      <ToggleRow
        label="weekly digest"
        helperText="sundays at noon utc — battle stats, biggest elo swing, best scan from the past week."
        on={profile.weekly_digest}
        onChange={(next) => void apply({ weekly_digest: next })}
        saving={state.kind === 'pending'}
      />
      <ToggleRow
        label="leaderboard alerts"
        helperText="email me when someone bumps me off the top scan board, or when my best scan gets beaten."
        on={profile.mog_email_alerts}
        onChange={(next) => void apply({ mog_email_alerts: next })}
        saving={state.kind === 'pending'}
      />
    </Section>
  );
}
