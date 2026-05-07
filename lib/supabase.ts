import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

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

export type LeaderboardRow = {
  id: string;
  name: string;
  overall: number;
  tier: string;
  jawline: number;
  eyes: number;
  skin: number;
  cheekbones: number;
  image_url: string | null;
  created_at: string;
};

export const FACES_BUCKET = 'holymog-faces';
