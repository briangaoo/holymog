import { AccessToken } from 'livekit-server-sdk';
import type { SubScores } from '@/types';

const TOKEN_TTL_SECONDS = 60 * 30; // 30 min — generous for a 10s battle

/**
 * Mint a LiveKit room access token for a participant.
 *
 * The token grants subscribe + publish permission in the named room
 * for `TOKEN_TTL_SECONDS`. Identity is the user_id (so LiveKit
 * participant identifiers map 1:1 to Auth.js user IDs); name is the
 * profile display_name (so participant tiles can be labelled without
 * an extra DB roundtrip).
 *
 * Metadata carries the user's equipped cosmetic slugs + the userStats
 * fields smart cosmetics need to render correctly during the battle.
 * The client-side BattleRoom parses this back via `parseMetadata`.
 */
export async function mintLiveKitToken(opts: {
  room: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  equippedFrame?: string | null;
  equippedFlair?: string | null;
  equippedNameFx?: string | null;
  /** UserStats fields — sent so smart cosmetics render correctly on
   *  the opposing player's battle tile without a separate DB call. */
  elo?: number | null;
  currentStreak?: number | null;
  bestScanOverall?: number | null;
  matchesWon?: number | null;
  weakestSubScore?: keyof SubScores | null;
  /** True when this participant is an active holymog+ subscriber.
   *  Drives the SubscriberBadge inline next to the display name. */
  isSubscriber?: boolean;
}): Promise<{ token: string; url: string }> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    throw new Error(
      'LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or NEXT_PUBLIC_LIVEKIT_URL is missing',
    );
  }

  // Compose metadata. Only include keys with non-null values so the
  // parsed object on the client stays small (LiveKit caps participant
  // metadata around 1KB; we're well under that). Nulls would round-
  // trip as actual null values and clutter the JSON.
  const metaShape: Record<string, string | number | boolean> = {};
  if (opts.avatarUrl) metaShape.avatarUrl = opts.avatarUrl;
  if (opts.equippedFrame) metaShape.equippedFrame = opts.equippedFrame;
  if (opts.equippedFlair) metaShape.equippedFlair = opts.equippedFlair;
  if (opts.equippedNameFx) metaShape.equippedNameFx = opts.equippedNameFx;
  if (typeof opts.elo === 'number') metaShape.elo = opts.elo;
  if (typeof opts.currentStreak === 'number')
    metaShape.currentStreak = opts.currentStreak;
  if (typeof opts.bestScanOverall === 'number')
    metaShape.bestScanOverall = opts.bestScanOverall;
  if (typeof opts.matchesWon === 'number')
    metaShape.matchesWon = opts.matchesWon;
  if (opts.weakestSubScore)
    metaShape.weakestSubScore = opts.weakestSubScore;
  if (opts.isSubscriber) metaShape.isSubscriber = true;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.userId,
    name: opts.displayName,
    ttl: TOKEN_TTL_SECONDS,
    metadata:
      Object.keys(metaShape).length > 0 ? JSON.stringify(metaShape) : undefined,
  });

  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return { token, url };
}
