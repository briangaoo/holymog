'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AtSign,
  Camera,
  Check,
  Hash,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { AvatarUploader } from '@/components/AvatarUploader';
import { AvatarFallback } from '@/components/AvatarFallback';
import { BannerUploader } from '@/components/BannerUploader';
import {
  SaveIndicator,
  Section,
  type FieldUpdate,
  type SaveState,
  type SettingsProfile,
  useAutoIdle,
} from './shared';

type SocialKey = 'instagram' | 'x' | 'snapchat' | 'tiktok' | 'discord';
const SOCIAL_KEYS: SocialKey[] = ['instagram', 'x', 'snapchat', 'tiktok', 'discord'];
const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: 'instagram',
  x: 'x',
  snapchat: 'snapchat',
  tiktok: 'tiktok',
  discord: 'discord',
};
const SOCIAL_PLACEHOLDERS: Record<SocialKey, string> = {
  instagram: 'yourhandle',
  x: 'yourhandle',
  snapchat: 'yourhandle',
  tiktok: 'yourhandle',
  discord: 'yourhandle',
};
const MAX_BIO_LEN = 240;
const MAX_SOCIAL_LEN = 32;
const MAX_LOCATION_LEN = 60;
const USERNAME_REGEX = /^[a-z0-9_-]{3,24}$/;
/**
 * Profile section — banner + avatar editor + bio + location + socials.
 *
 * The banner sits at the very top (twitter-style 3:1 aspect crop). Click
 * the banner to upload, hover for a remove button when one is set. The
 * avatar lives in its own modal (AvatarUploader). Bio + location +
 * socials all save together via the bottom save button — text fields
 * shouldn't auto-save on every keystroke. Display name has its own
 * dedicated section above.
 */
export function ProfileSection({
  profile,
  onUpdate,
  onRefresh,
}: {
  profile: SettingsProfile;
  onUpdate: (patch: FieldUpdate) => Promise<{ ok: boolean; error?: string; message?: string }>;
  /** Called after any profile mutation that other parts of the page
   *  (header avatar/name, public-profile link, etc) should pick up
   *  without a full reload. */
  onRefresh?: () => void | Promise<void>;
}) {
  const { user } = useUser();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.image ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url);
  const [bannerBusy, setBannerBusy] = useState<'idle' | 'removing'>('idle');
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Inline username editor (replaces the standalone UsernameSection
  // that used to live below this one). Same /api/account/me PATCH +
  // server-side rate-limit + collision check as before; on success we
  // hard-reload so every other component picks up the new handle.
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(profile.display_name);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [socials, setSocials] = useState<Record<SocialKey, string>>(() => {
    const out = {} as Record<SocialKey, string>;
    for (const k of SOCIAL_KEYS) {
      out[k] = (profile.socials?.[k] as string | null | undefined) ?? '';
    }
    return out;
  });
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  useAutoIdle(state, setState);

  useEffect(() => {
    setAvatarUrl(user?.image ?? null);
  }, [user?.image]);

  // Keep banner state in sync if the parent re-fetches /api/account/me
  // (e.g. after another save flow).
  useEffect(() => {
    setBannerUrl(profile.banner_url);
  }, [profile.banner_url]);

  const dirty =
    bio.trim() !== (profile.bio ?? '') ||
    location.trim() !== (profile.location ?? '') ||
    SOCIAL_KEYS.some(
      (k) => socials[k].trim() !== ((profile.socials?.[k] as string | null | undefined) ?? ''),
    );

  const onSave = useCallback(async () => {
    if (!dirty) return;
    setState({ kind: 'pending' });

    const trimmedBio = bio.trim();
    const trimmedLocation = location.trim();
    if (trimmedBio.length > MAX_BIO_LEN) {
      setState({ kind: 'error', message: `bio max ${MAX_BIO_LEN} chars` });
      return;
    }
    if (trimmedLocation.length > MAX_LOCATION_LEN) {
      setState({
        kind: 'error',
        message: `location max ${MAX_LOCATION_LEN} chars`,
      });
      return;
    }

    const socialsPatch: Record<string, string> = {};
    for (const k of SOCIAL_KEYS) {
      const next = socials[k].trim().slice(0, MAX_SOCIAL_LEN);
      const prev = (profile.socials?.[k] as string | null | undefined) ?? '';
      if (next !== prev) socialsPatch[k] = next;
    }

    const patch: FieldUpdate = {};
    if (trimmedBio !== (profile.bio ?? '')) {
      patch.bio = trimmedBio.length === 0 ? null : trimmedBio;
    }
    if (trimmedLocation !== (profile.location ?? '')) {
      patch.location = trimmedLocation.length === 0 ? null : trimmedLocation;
    }
    if (Object.keys(socialsPatch).length > 0) {
      patch.socials = socialsPatch;
    }

    const res = await onUpdate(patch);
    if (res.ok) setState({ kind: 'saved' });
    else setState({ kind: 'error', message: res.message ?? res.error ?? 'failed' });
  }, [dirty, bio, location, socials, profile, onUpdate]);

  // BannerUploader handles file pick + crop + upload in its own modal.
  // ProfileSection only opens it and consumes the resulting URL.
  const onOpenBannerUploader = useCallback(() => {
    if (bannerBusy !== 'idle') return;
    setBannerError(null);
    setBannerOpen(true);
  }, [bannerBusy]);

  const removeAvatar = useCallback(async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      if (res.ok) {
        setAvatarUrl(null);
        if (onRefresh) void onRefresh();
      }
    } catch {
      // best-effort
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, onRefresh]);

  const onUsernameEnter = useCallback(() => {
    setUsernameDraft(profile.display_name);
    setUsernameError(null);
    setUsernameEditing(true);
  }, [profile.display_name]);

  const onUsernameCancel = useCallback(() => {
    setUsernameEditing(false);
    setUsernameError(null);
  }, []);

  const onUsernameSave = useCallback(async () => {
    const value = usernameDraft.trim();
    if (!USERNAME_REGEX.test(value)) {
      setUsernameError('3–24 chars · a-z 0-9 _ -');
      return;
    }
    if (value === profile.display_name) {
      setUsernameEditing(false);
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
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
        setUsernameError(msg);
        setUsernameSaving(false);
        return;
      }
      // No hard reload — refreshMe() re-fetches /api/account/me so the
      // header chip and leaderboard row pick up the new handle
      // in-place. Snappier than a full nav and preserves tab state.
      setUsernameEditing(false);
      setUsernameSaving(false);
      if (onRefresh) void onRefresh();
    } catch {
      setUsernameError('network error');
      setUsernameSaving(false);
    }
  }, [usernameDraft, profile.display_name, onRefresh]);

  const onRemoveBanner = useCallback(async () => {
    if (bannerBusy !== 'idle') return;
    setBannerError(null);
    setBannerBusy('removing');
    try {
      const res = await fetch('/api/account/banner', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setBannerError(data.error ?? 'remove failed');
        return;
      }
      setBannerUrl(null);
      if (onRefresh) void onRefresh();
    } catch {
      setBannerError('remove failed');
    } finally {
      setBannerBusy('idle');
    }
  }, [bannerBusy, onRefresh]);

  const avatarSeed = profile.display_name || user?.email || '?';

  return (
    <Section
      id="profile"
      label="profile"
      description="how you appear to everyone else."
      icon={User}
      accent="sky"
      meta={<SaveIndicator state={state} />}
    >
      {/* Banner uploader — twitter-style wide image. Renders at 3:1
          when set; blank state shows an upload prompt over a tier-
          neutral gradient. Click anywhere to pick a new file. */}
      <div className="border-t border-white/5 px-5 pt-5 pb-2">
        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-[13px] font-medium text-zinc-300">banner</span>
          <span className="text-[12px] text-zinc-500">
            shown at the top of your profile
          </span>
        </div>
        <div className="group relative aspect-[3/1] w-full overflow-hidden rounded-sm border border-white/10 bg-white/[0.02]">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)',
              }}
            />
          )}
          <button
            type="button"
            onClick={onOpenBannerUploader}
            disabled={bannerBusy !== 'idle'}
            style={{ touchAction: 'manipulation' }}
            className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 text-[13px] font-medium text-white transition-colors hover:bg-black/45 focus-visible:bg-black/45 focus-visible:outline-none disabled:cursor-wait"
            aria-label={bannerUrl ? 'replace banner' : 'upload banner'}
          >
            <span
              className={`inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-[13px] backdrop-blur-md transition-opacity ${
                bannerUrl
                  ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                  : 'opacity-100'
              }`}
            >
              <ImagePlus size={14} aria-hidden />
              {bannerUrl ? 'replace banner' : 'upload banner'}
            </span>
          </button>
          {bannerUrl && bannerBusy === 'idle' && (
            <button
              type="button"
              onClick={onRemoveBanner}
              aria-label="remove banner"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-zinc-100 opacity-0 backdrop-blur-md transition-opacity hover:bg-red-500/85 hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[12px] text-zinc-500">
            <span className="uppercase">png / jpg / webp</span> · max 4{' '}
            <span className="uppercase">mb</span> · 3:1 looks best
          </span>
          {bannerError && (
            <span className="text-[12px] text-red-400">{bannerError}</span>
          )}
        </div>
      </div>

      {/* Avatar + handle row. Layout note: when editing the username the
          buttons sit on the same baseline as the input (not centered
          against the whole input+hint column), so the cancel/save
          chips align visually with the field rather than floating
          above it. */}
      <div className="flex items-start gap-4 border-t border-white/5 px-5 py-5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/15 transition-transform hover:scale-[1.03]"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarFallback seed={avatarSeed} textClassName="text-2xl" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity hover:opacity-100">
              <Camera size={16} className="text-white" aria-hidden />
            </span>
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={removeAvatar}
              aria-label="remove avatar"
              disabled={avatarBusy}
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black text-zinc-200 shadow-md transition-colors hover:bg-red-500/85 hover:text-white disabled:opacity-50"
            >
              <Trash2 size={11} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          {usernameEditing ? (
            <>
              <div className="flex min-w-0 items-stretch gap-2">
                <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-sm border border-white bg-white/[0.04] focus-within:border-white focus-within:ring-2 focus-within:ring-white/15">
                  <span
                    aria-hidden
                    className="flex select-none items-center pl-2 pr-1 text-zinc-500"
                  >
                    <AtSign size={13} />
                  </span>
                  <input
                    type="text"
                    value={usernameDraft}
                    autoFocus
                    disabled={usernameSaving}
                    onChange={(e) => {
                      const sanitized = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, '')
                        .slice(0, 24);
                      setUsernameDraft(sanitized);
                      if (usernameError) setUsernameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onUsernameSave();
                      if (e.key === 'Escape') onUsernameCancel();
                    }}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoComplete="off"
                    placeholder="briangao"
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] text-foreground placeholder:text-zinc-600 focus:outline-none"
                    style={{ textTransform: 'lowercase' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={onUsernameCancel}
                  disabled={usernameSaving}
                  aria-label="cancel"
                  className="inline-flex w-10 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-white/[0.03] text-zinc-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
                >
                  <X size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onUsernameSave}
                  disabled={usernameSaving || !usernameDraft.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-foreground px-3 text-[13px] font-semibold text-background transition-all hover:opacity-90 hover:shadow-[0_0_0_2px_rgba(255,255,255,0.20)] disabled:opacity-50 disabled:hover:shadow-none"
                >
                  {usernameSaving ? (
                    <>
                      <Loader2 size={13} className="animate-spin" aria-hidden /> saving…
                    </>
                  ) : (
                    <>
                      <Check size={13} aria-hidden /> save
                    </>
                  )}
                </button>
              </div>
              {usernameError ? (
                <span className="truncate text-[12px] text-red-400">
                  {usernameError}
                </span>
              ) : (
                <span className="truncate text-[12px] text-zinc-500">
                  3–24 chars · letters, numbers, _, -
                </span>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[16px] font-medium text-foreground">
                  {profile.display_name || 'unnamed'}
                </span>
                {user?.email && (
                  <span className="truncate text-[13px] text-zinc-500">
                    {user.email}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onUsernameEnter}
                aria-label="change username"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-foreground"
              >
                <Pencil size={13} aria-hidden /> change
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      <div className="flex flex-col gap-2 border-t border-white/5 px-5 py-5">
        <label htmlFor="bio" className="text-[13px] font-medium text-zinc-300">
          bio
        </label>
        <textarea
          id="bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LEN))}
          placeholder="tell people who you are"
          className="w-full resize-none rounded-sm border border-white/10 bg-white/[0.02] px-3.5 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-zinc-600 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/15"
        />
        <span className="self-end text-[12px] tabular-nums text-zinc-600">
          {bio.length} / {MAX_BIO_LEN}
        </span>
      </div>

      {/* Location */}
      <div className="flex flex-col gap-2 border-t border-white/5 px-5 py-5">
        <label
          htmlFor="location"
          className="text-[13px] font-medium text-zinc-300"
        >
          location
        </label>
        <div className="flex items-stretch overflow-hidden rounded-sm border border-white/10 bg-white/[0.02] focus-within:border-white focus-within:ring-2 focus-within:ring-white/15">
          <span className="flex items-center pl-3 pr-1.5 text-zinc-500">
            <MapPin size={14} aria-hidden />
          </span>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) =>
              setLocation(e.target.value.slice(0, MAX_LOCATION_LEN))
            }
            placeholder="san francisco, ca"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent py-2.5 pr-3.5 text-[14px] text-foreground placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <span className="self-end text-[12px] tabular-nums text-zinc-600">
          {location.length} / {MAX_LOCATION_LEN}
        </span>
      </div>

      {/* Socials */}
      <div className="flex flex-col gap-3 border-t border-white/5 px-5 py-5">
        <span className="text-[13px] font-medium text-zinc-300">socials</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => {
            const PrefixIcon = k === 'discord' ? Hash : AtSign;
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <label
                  htmlFor={`social-${k}`}
                  className="text-[12px] text-zinc-500"
                >
                  {SOCIAL_LABELS[k]}
                </label>
                <div className="flex items-stretch overflow-hidden rounded-sm border border-white/10 bg-white/[0.02] focus-within:border-white focus-within:ring-2 focus-within:ring-white/15">
                  <span className="flex items-center pl-3 pr-1.5 text-zinc-500">
                    <PrefixIcon size={14} aria-hidden />
                  </span>
                  <input
                    id={`social-${k}`}
                    type="text"
                    value={socials[k]}
                    onChange={(e) =>
                      setSocials((prev) => ({
                        ...prev,
                        [k]: e.target.value.slice(0, MAX_SOCIAL_LEN),
                      }))
                    }
                    placeholder={SOCIAL_PLACEHOLDERS[k]}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-transparent py-2.5 pr-3 text-[14px] text-foreground placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save row */}
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-5 py-4">
        <span className="text-[12px] text-zinc-500">
          shown publicly on /@{profile.display_name || 'you'}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || state.kind === 'pending'}
          style={{ touchAction: 'manipulation' }}
          className="rounded-sm bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition-all hover:opacity-90 hover:shadow-[0_0_0_2px_rgba(255,255,255,0.2)] disabled:opacity-40 disabled:hover:shadow-none"
        >
          {state.kind === 'pending' ? 'saving…' : 'save'}
        </button>
      </div>

      <AvatarUploader
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onSaved={(url) => {
          setAvatarUrl(url);
          if (onRefresh) void onRefresh();
        }}
      />
      <BannerUploader
        open={bannerOpen}
        onClose={() => setBannerOpen(false)}
        onSaved={(url) => {
          setBannerUrl(url);
          if (onRefresh) void onRefresh();
        }}
      />
    </Section>
  );
}
