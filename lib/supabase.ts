import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}

/**
 * Service-role Supabase client. Server-only. Bypasses RLS — use this
 * for any server-side write where the API route has already
 * authenticated the user (storage uploads, leaderboard inserts, etc.).
 *
 * Falls back to the anon-key client when SUPABASE_SERVICE_ROLE_KEY
 * isn't set so local dev still works as long as the bucket / table
 * RLS allows the operation.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return null;
  if (!serviceKey) return getSupabase();
  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export type LeaderboardRow = {
  id: string;
  user_id: string;
  name: string;
  overall: number;
  tier: string;
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
  image_url: string | null;
  image_path: string | null;
  avatar_url: string | null;
  created_at: string;
  // Cosmetic + subscriber state merged from profiles by the leaderboard
  // GET endpoint. Used by leaderboard rows to render frame/badge/name fx
  // and the holymog+ badge inline with the row.
  equipped_frame?: string | null;
  equipped_flair?: string | null;
  equipped_name_fx?: string | null;
  is_subscriber?: boolean;
  // userStats fields for smart cosmetics rendering on rows.
  current_streak?: number | null;
  matches_won?: number | null;
};

export const UPLOADS_BUCKET = 'holymog-uploads';
export const BATTLES_BUCKET = 'holymog-battles';
