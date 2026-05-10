'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Camera,
  Hash,
  ImagePlus,
  MapPin,
  Pencil,
  Trash2,
  User,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { AvatarUploader } from '@/components/AvatarUploader';
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
const MAX_BANNER_BYTES = 4 * 1024 * 1024;

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
}: {
  profile: SettingsProfile;
  onUpdate: (patch: FieldUpdate) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const { user } = useUser();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.image ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url);
  const [bannerBusy, setBannerBusy] = useState<'idle' | 'uploading' | 'removing'>(
    'idle',
  );
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);

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

  const onPickBannerFile = useCallback(() => {
    if (bannerBusy !== 'idle') return;
    bannerFileRef.current?.click();
  }, [bannerBusy]);

  const onBannerChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-uploading the same file
      if (!file) return;
      setBannerError(null);
      if (file.size > MAX_BANNER_BYTES) {
        setBannerError('banner max 4 MB');
        return;
      }
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        setBannerError('use PNG, JPG, or WEBP');
        return;
      }
      setBannerBusy('uploading');
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/account/banner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setBannerError(data.error ?? 'upload failed');
          return;
        }
        const data = (await res.json()) as { banner_url?: string };
        if (data.banner_url) setBannerUrl(data.banner_url);
      } catch {
        setBannerError('upload failed');
      } finally {
        setBannerBusy('idle');
      }
    },
    [],
  );

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
    } catch {
      setBannerError('remove failed');
    } finally {
      setBannerBusy('idle');
    }
  }, [bannerBusy]);

  const initial = (profile.display_name || user?.email || '?')
    .charAt(0)
    .toUpperCase();

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
        <div className="group relative aspect-[3/1] w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
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
                  'linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(167,139,250,0.18) 50%, rgba(244,63,94,0.16) 100%)',
              }}
            />
          )}
          <button
            type="button"
            onClick={onPickBannerFile}
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
              {bannerBusy === 'uploading' ? (
                <>uploading…</>
              ) : (
                <>
                  <ImagePlus size={14} aria-hidden />
                  {bannerUrl ? 'replace banner' : 'upload banner'}
                </>
              )}
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
            PNG / JPG / WEBP · max 4 MB · 3:1 looks best
          </span>
          {bannerError && (
            <span className="text-[12px] text-red-400">{bannerError}</span>
          )}
        </div>
        <input
          ref={bannerFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onBannerChange}
          className="hidden"
          aria-hidden
        />
      </div>

      {/* Avatar + handle row */}
      <div className="flex items-center gap-4 border-t border-white/5 px-5 py-5">
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04] transition-transform hover:scale-[1.03]"
          title="change avatar"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-semibold text-foreground">{initial}</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity hover:opacity-100">
            <Camera size={16} className="text-white" aria-hidden />
          </span>
        </button>
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
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
          onClick={() => setAvatarOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-foreground"
        >
          <Pencil size={13} aria-hidden /> change
        </button>
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
          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
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
        <div className="flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/15">
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
                <div className="flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/15">
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
          className="rounded-lg bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition-all hover:opacity-90 hover:shadow-[0_0_0_2px_rgba(56,189,248,0.2)] disabled:opacity-40 disabled:hover:shadow-none"
        >
          {state.kind === 'pending' ? 'saving…' : 'save'}
        </button>
      </div>

      <AvatarUploader
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onSaved={(url) => setAvatarUrl(url)}
      />
    </Section>
  );
}
