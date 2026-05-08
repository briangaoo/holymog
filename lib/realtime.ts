/**
 * Server-side broadcast over Supabase Realtime via the HTTP-only
 * /realtime/v1/api/broadcast endpoint. Stateless — no channel
 * subscribe/unsubscribe round-trip per call. Used during battles
 * to fan out per-frame score updates and the battle.finished event.
 */
export async function broadcastBattleEvent(
  battleId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const apikey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !apikey) {
    // Realtime isn't configured; silently skip. The client UI will
    // fall back to polling /api/account/me or similar if needed.
    return;
  }

  const url = `${supabaseUrl}/realtime/v1/api/broadcast`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey,
      Authorization: `Bearer ${apikey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `battle:${battleId}`, event, payload }],
    }),
  }).catch(() => {
    // best-effort; broadcast failures don't block the API response
  });
}
