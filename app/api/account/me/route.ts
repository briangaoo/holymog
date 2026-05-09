import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getSupabase, type LeaderboardRow } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME_LEN = 24;

type Profile = {
  display_name: string;
  elo: number;
  peak_elo: number;
  matches_played: number;
  matches_won: number;
  current_streak: number;
  longest_streak: number;
  best_scan_overall: number | null;
  best_scan: unknown;
  improvement_counts: Record<string, number>;
};

/**
 * GET — return the current authenticated user's profile + their leaderboard
 * row (if any). Used by the leaderboard modal to prefill name + previous-
 * score comparison and by the account settings tab to show editable fields.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const pool = getPool();
  const profileResult = await pool.query<Profile>(
    `select display_name, elo, peak_elo, matches_played, matches_won,
            current_streak, longest_streak, best_scan_overall,
            best_scan, improvement_counts
       from profiles
       where user_id = $1
       limit 1`,
    [user.id],
  );
  const profile = profileResult.rows[0] ?? null;

  let entry: LeaderboardRow | null = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    entry = (data as LeaderboardRow | null) ?? null;
  }

  return NextResponse.json({ profile, entry });
}

type PatchBody = { display_name?: unknown };

/**
 * PATCH — update the current user's display name. Only field the user can
 * edit through this endpoint for now; ELO and stat counters are server-
 * managed.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.display_name !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const display = body.display_name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LEN);
  if (display.length === 0) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `update profiles set display_name = $1 where user_id = $2`,
    [display, user.id],
  );

  return NextResponse.json({ ok: true, display_name: display });
}
