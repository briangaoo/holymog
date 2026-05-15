'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

// ---- Types ----------------------------------------------------------------

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export type SettingsProfile = {
  display_name: string;
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  socials: Record<string, string | null> | null;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  mute_battle_sfx: boolean;
  weekly_digest: boolean;
  mog_email_alerts: boolean;
  equipped_flair: string | null;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_name_fx: string | null;
  two_factor_enabled: boolean;
  /** Subscription state — populated from profiles.subscription_*. */
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_current_period_end: string | null;
  monthly_cosmetic_claimed_at: string | null;
};

export type FieldUpdate = Partial<{
  bio: string | null;
  location: string | null;
  socials: Record<string, string>;
  hide_photo_from_leaderboard: boolean;
  hide_elo: boolean;
  mute_battle_sfx: boolean;
  weekly_digest: boolean;
  mog_email_alerts: boolean;
}>;

/** Section accent type. Preserved for callsite API compatibility (every
 *  Section / FilterChip in the codebase still passes a colour name) but
 *  the brutalist redesign no longer differentiates accents — every
 *  section renders the same monochrome treatment. */
export type SectionAccent =
  | 'sky'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'emerald'
  | 'purple'
  | 'red'
  | 'zinc'
  | 'indigo'
  | 'teal'
  | 'fuchsia'
  | 'orange';

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
}>;

/** Hard 2px-border section card. The previous Discord-flavoured liquid-
 *  glass body with per-section colour wash + cursor-tracking SpectralRim
 *  is collapsed to a single monochrome treatment: pure black background,
 *  white border, uppercase title. Accent prop is preserved on the API
 *  but no longer drives any visual difference. */
export function Section({
  id,
  label,
  description,
  icon: Icon,
  accent: _accent = 'zinc',
  meta,
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  icon?: IconComponent;
  accent?: SectionAccent;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="relative rounded-xl border border-white/10 bg-zinc-950/60"
    >
      <header className="relative flex items-center gap-3.5 px-5 pb-3 pt-5">
        {Icon && (
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.04]"
          >
            <Icon size={18} aria-hidden className="text-white" />
          </span>
        )}
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span className="text-[15px] font-semibold leading-tight text-white">
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </span>
          {description && (
            <span className="text-[12px] leading-relaxed text-white/50">
              {description}
            </span>
          )}
        </div>
        {meta}
      </header>
      <div className="relative flex flex-col">{children}</div>
    </section>
  );
}

/** Inline status indicator. Fades in/out, lives in the section header. */
export function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-white/55">
        <Loader2 size={11} className="animate-spin" aria-hidden /> Saving
      </span>
    );
  }
  if (state.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
        <Check size={11} aria-hidden /> Saved
      </span>
    );
  }
  if (state.kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
        <AlertTriangle size={11} aria-hidden /> {state.message}
      </span>
    );
  }
  return null;
}

/** Brutalist switch — hard square track, hard square thumb. White-on
 *  when active, dim-white-off when inactive. Animates the thumb position
 *  via translate, no rounded glow. */
export function Toggle({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{ touchAction: 'manipulation', borderRadius: 2 }}
      className={`relative inline-flex h-7 w-[52px] flex-shrink-0 items-center border-2 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        on
          ? 'border-white bg-white'
          : 'border-white/30 bg-black hover:border-white/50'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-4 w-4 transition-transform duration-200 ease-out ${
          on ? 'translate-x-[28px] bg-black' : 'translate-x-1 bg-white/60'
        }`}
        style={{ borderRadius: 1 }}
      />
    </button>
  );
}

/** Row pattern reused by privacy / battle / notifications. Left side
 *  is label + helper text, right side is a switch. */
export function ToggleRow({
  label,
  helperText,
  on,
  onChange,
  saving,
}: {
  label: string;
  helperText?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-t border-white/15 px-5 py-4 transition-colors hover:bg-white/[0.02]">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium leading-snug text-white">
          {label}
        </div>
        {helperText && (
          <p className="mt-1 text-[12px] leading-relaxed text-white/50">
            {helperText}
          </p>
        )}
      </div>
      <Toggle on={on} onChange={onChange} disabled={saving} ariaLabel={label} />
    </div>
  );
}

// ---- Hooks ----------------------------------------------------------------

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useAutoIdle(
  state: SaveState,
  setState: (s: SaveState) => void,
  ms = 1800,
) {
  const lastKindRef = useRef<SaveState['kind'] | null>(null);
  useEffect(() => {
    if (state.kind !== lastKindRef.current) {
      lastKindRef.current = state.kind;
    }
    if (state.kind === 'saved' || state.kind === 'error') {
      const id = window.setTimeout(() => setState({ kind: 'idle' }), ms);
      return () => window.clearTimeout(id);
    }
  }, [state, setState, ms]);
}
