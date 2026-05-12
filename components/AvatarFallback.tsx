'use client';

/**
 * AvatarFallback — the colored-initial circle we render when a user
 * doesn't have an uploaded image. Single source of truth for the
 * deterministic hue → background colour, so the header chip, the
 * /account header row, the settings "change picture" tile, and the
 * /@username public profile all look identical for a given username.
 *
 * Hash → hue is intentionally cheap and stable: same display_name
 * → same colour across surfaces and across sessions.
 */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function avatarInitial(seed: string): string {
  return (seed.charAt(0) || '?').toUpperCase();
}

type Props = {
  /** Username, email, or whatever identifies the user. */
  seed: string;
  /** Tailwind text-size class for the initial. Default text-xs (32px tile). */
  textClassName?: string;
  /** Additional classes for sizing/positioning — defaults to filling parent. */
  className?: string;
};

export function AvatarFallback({
  seed,
  textClassName = 'text-xs',
  className = 'h-full w-full',
}: Props) {
  const hue = avatarHue(seed);
  return (
    <span
      className={`flex items-center justify-center font-semibold text-white normal-case ${textClassName} ${className}`}
      style={{ backgroundColor: `hsl(${hue}, 55%, 38%)` }}
    >
      {avatarInitial(seed)}
    </span>
  );
}
