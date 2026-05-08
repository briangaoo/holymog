import { AccessToken } from 'livekit-server-sdk';

const TOKEN_TTL_SECONDS = 60 * 30; // 30 min — generous for a 10s battle

/**
 * Mint a LiveKit room access token for a participant.
 *
 * The token grants subscribe + publish permission in the named room
 * for `TOKEN_TTL_SECONDS`. Identity is the user_id (so LiveKit
 * participant identifiers map 1:1 to Auth.js user IDs); name is the
 * profile display_name (so participant tiles can be labelled without
 * an extra DB roundtrip).
 */
export async function mintLiveKitToken(opts: {
  room: string;
  userId: string;
  displayName: string;
}): Promise<{ token: string; url: string }> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    throw new Error(
      'LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or NEXT_PUBLIC_LIVEKIT_URL is missing',
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.userId,
    name: opts.displayName,
    ttl: TOKEN_TTL_SECONDS,
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
