'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Used only for Realtime subscriptions
 * (postgres_changes + broadcast) on world-readable tables. No auth
 * integration — Auth.js owns user sessions. Singleton so that the
 * Realtime websocket is reused across components.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
