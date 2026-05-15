'use client';

import { useCallback, useState } from 'react';
import { Swords } from 'lucide-react';
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
 * Battle preferences. Currently a single toggle; reserved for future
 * additions (reduced motion, haptic feedback, default camera, etc).
 */
export function BattleSection({
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
      id="battle"
      label="battles"
      description="How mog battles feel for you."
      icon={Swords}
      accent="rose"
      meta={<SaveIndicator state={state} />}
    >
      <ToggleRow
        label="mute battle sound effects"
        helperText="silences countdown ticks, score-pop chimes, and the win/loss flourish."
        on={profile.mute_battle_sfx}
        onChange={(next) => void apply({ mute_battle_sfx: next })}
        saving={state.kind === 'pending'}
      />
    </Section>
  );
}
