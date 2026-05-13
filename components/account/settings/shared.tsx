'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { SpectralRim } from '@/components/SpectralRim';

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

/** Brand-tinted accent for each section. Drives both the icon-square
 *  background and the subtle top-of-card gradient. */
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

const ACCENT_STYLES: Record<
  SectionAccent,
  {
    /** Icon container background. */
    iconBg: string;
    /** Icon foreground colour. */
    iconColor: string;
    /** Section card border. */
    border: string;
    /** Soft top-edge wash for atmosphere. */
    glow: string;
    /** Title colour. */
    title: string;
    /** Accent feeding the SpectralRim cursor follow — saturated rgba. */
    spectral: string;
  }
> = {
  sky: {
    iconBg: 'rgba(56,189,248,0.14)',
    iconColor: '#7dd3fc',
    border: 'rgba(56,189,248,0.18)',
    glow: 'rgba(56,189,248,0.10)',
    title: '#e0f2fe',
    spectral: 'rgba(56,189,248,0.85)',
  },
  violet: {
    iconBg: 'rgba(167,139,250,0.14)',
    iconColor: '#c4b5fd',
    border: 'rgba(167,139,250,0.18)',
    glow: 'rgba(167,139,250,0.10)',
    title: '#ede9fe',
    spectral: 'rgba(167,139,250,0.85)',
  },
  amber: {
    iconBg: 'rgba(251,191,36,0.16)',
    iconColor: '#fcd34d',
    border: 'rgba(251,191,36,0.20)',
    glow: 'rgba(251,191,36,0.10)',
    title: '#fef3c7',
    spectral: 'rgba(251,191,36,0.85)',
  },
  rose: {
    iconBg: 'rgba(244,63,94,0.14)',
    iconColor: '#fda4af',
    border: 'rgba(244,63,94,0.18)',
    glow: 'rgba(244,63,94,0.10)',
    title: '#ffe4e6',
    spectral: 'rgba(244,63,94,0.85)',
  },
  cyan: {
    iconBg: 'rgba(34,211,238,0.14)',
    iconColor: '#67e8f9',
    border: 'rgba(34,211,238,0.18)',
    glow: 'rgba(34,211,238,0.10)',
    title: '#cffafe',
    spectral: 'rgba(34,211,238,0.85)',
  },
  emerald: {
    iconBg: 'rgba(16,185,129,0.14)',
    iconColor: '#6ee7b7',
    border: 'rgba(16,185,129,0.18)',
    glow: 'rgba(16,185,129,0.10)',
    title: '#d1fae5',
    spectral: 'rgba(16,185,129,0.85)',
  },
  purple: {
    iconBg: 'rgba(168,85,247,0.14)',
    iconColor: '#d8b4fe',
    border: 'rgba(168,85,247,0.18)',
    glow: 'rgba(168,85,247,0.10)',
    title: '#f3e8ff',
    spectral: 'rgba(168,85,247,0.85)',
  },
  red: {
    iconBg: 'rgba(239,68,68,0.16)',
    iconColor: '#fca5a5',
    border: 'rgba(239,68,68,0.30)',
    glow: 'rgba(239,68,68,0.10)',
    title: '#fee2e2',
    spectral: 'rgba(239,68,68,0.85)',
  },
  zinc: {
    iconBg: 'rgba(255,255,255,0.06)',
    iconColor: '#d4d4d8',
    border: 'rgba(255,255,255,0.10)',
    glow: 'rgba(255,255,255,0.04)',
    title: '#e4e4e7',
    spectral: 'rgba(255,255,255,0.55)',
  },
  indigo: {
    iconBg: 'rgba(99,102,241,0.16)',
    iconColor: '#a5b4fc',
    border: 'rgba(99,102,241,0.20)',
    glow: 'rgba(99,102,241,0.10)',
    title: '#e0e7ff',
    spectral: 'rgba(99,102,241,0.85)',
  },
  teal: {
    iconBg: 'rgba(20,184,166,0.16)',
    iconColor: '#5eead4',
    border: 'rgba(20,184,166,0.20)',
    glow: 'rgba(20,184,166,0.10)',
    title: '#ccfbf1',
    spectral: 'rgba(20,184,166,0.85)',
  },
  fuchsia: {
    iconBg: 'rgba(217,70,239,0.14)',
    iconColor: '#f0abfc',
    border: 'rgba(217,70,239,0.20)',
    glow: 'rgba(217,70,239,0.10)',
    title: '#fae8ff',
    spectral: 'rgba(217,70,239,0.85)',
  },
  orange: {
    iconBg: 'rgba(249,115,22,0.16)',
    iconColor: '#fdba74',
    border: 'rgba(249,115,22,0.20)',
    glow: 'rgba(249,115,22,0.10)',
    title: '#ffedd5',
    spectral: 'rgba(249,115,22,0.85)',
  },
};

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
}>;

/** Discord-flavoured section card with liquid-glass body + cursor-
 *  reactive SpectralRim. Layers from back to front:
 *    1. SpectralRim wrapper — tracks cursor, paints a thin radial-
 *       gradient ring on the outermost edge using the section accent.
 *    2. Section element — semi-transparent gradient + backdrop-blur +
 *       saturate so any colour bleeding through (page ambient
 *       gradients, neighbouring section glows) gets refracted into the
 *       glass.
 *    3. Top sheen — a 1px linear-gradient highlight along the upper
 *       edge that sells the "lit glass" feel.
 *    4. Accent wash — soft accent-tinted gradient bleeding down from
 *       the top of the card; provides per-section identity colour.
 *    5. Content — the header (icon-square + title) and children rows.
 */
export function Section({
  id,
  label,
  description,
  icon: Icon,
  accent = 'zinc',
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
  const palette = ACCENT_STYLES[accent];
  return (
    <SpectralRim
      accent={palette.spectral}
      thickness={1.5}
      spotlight={220}
      className="rounded-2xl"
    >
      <section
        id={id}
        className="relative overflow-hidden rounded-2xl border"
        style={{
          borderColor: palette.border,
          // Liquid-glass body: layered translucent gradient + heavy
          // backdrop blur with saturation boost. Without ambient
          // colour behind, this still reads as frosted; with
          // /account's ambient gradients it picks up tint per region.
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 50%, rgba(255,255,255,0.025) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.40)',
        }}
      >
        {/* Top sheen — the lit-edge highlight that sells the glass. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
          }}
        />
        {/* Accent wash — soft section-tinted gradient at the top edge,
            stays under content via -z-0. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 -z-0"
          style={{
            background: `linear-gradient(180deg, ${palette.glow} 0%, transparent 100%)`,
          }}
        />
        <header className="relative flex items-center gap-3.5 px-5 pb-3 pt-5">
          {Icon && (
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{
                background: palette.iconBg,
                boxShadow: `inset 0 0 0 1px ${palette.border}`,
              }}
            >
              <Icon
                size={18}
                aria-hidden
                style={{ color: palette.iconColor } as React.CSSProperties}
              />
            </span>
          )}
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span
              className="text-[16px] font-semibold leading-tight normal-case"
              style={{ color: palette.title }}
            >
              {label}
            </span>
            {description && (
              <span className="text-[13px] leading-relaxed text-zinc-400">
                {description}
              </span>
            )}
          </div>
          {meta}
        </header>
        <div className="relative flex flex-col">{children}</div>
      </section>
    </SpectralRim>
  );
}

/** Inline status indicator. Fades in/out, lives in the section header. */
export function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
        <Loader2 size={11} className="animate-spin" aria-hidden /> saving
      </span>
    );
  }
  if (state.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
        <Check size={11} aria-hidden /> saved
      </span>
    );
  }
  if (state.kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
        <AlertTriangle size={11} aria-hidden /> {state.message}
      </span>
    );
  }
  return null;
}

/** Discord-flavoured switch — larger surface, spring thumb on toggle.
 *  Animates on press. Tap target is comfortable for thumbs (28×52). */
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
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex h-7 w-[52px] flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        on
          ? 'bg-sky-500 shadow-[0_0_0_2px_rgba(56,189,248,0.22)]'
          : 'bg-white/10 hover:bg-white/15'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          on ? 'translate-x-[26px] scale-100' : 'translate-x-0.5 scale-95'
        }`}
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
    <div className="flex items-center justify-between gap-5 border-t border-white/5 px-5 py-4 transition-colors hover:bg-white/[0.015]">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium leading-snug text-foreground">
          {label}
        </div>
        {helperText && (
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
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
