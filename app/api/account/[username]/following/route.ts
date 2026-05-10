import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type FollowEntry = {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  equipped_flair: string | null;
  equipped_frame: string | null;
  equipped_name_fx: string | null;
  followers_count: number;
  followed_at: string;
  viewer_is_following: boolean;
  is_viewer: boolean;
  elo: number | null;
  current_streak: number | null;
  best_scan_overall: number | null;
  matches_won: number | null;
  is_subscriber: boolean;
};

type FollowEntryRaw = Omit<FollowEntry, 'is_subscriber'> & {
  subscription_status: string | null;
};

async function resolveTarget(username: string): Promise<string | null> {
  const pool = getPool();
  const normalised = username.trim().toLowerCase();
  if (!normalised) return null;
  const direct = await pool.query<{ user_id: string }>(
    `select user_id from profiles where display_name = $1 limit 1`,
    [normalised],
  );
  if (direct.rows.length > 0) return direct.rows[0].user_id;
  const aliased = await pool.query<{ user_id: string }>(
    `select user_id from profiles
      where $1 = any(coalesce(previous_usernames, array[]::text[]))
      limit 1`,
    [normalised],
  );
  return aliased.rows[0]?.user_id ?? null;
}

/**
 * GET /api/account/[username]/following?page=N
 *
 * Mirror of the followers endpoint but resolves the inverse direction
 * — accounts [username] is following. Same row shape so the same
 * client-side list component renders both.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const targetId = await resolveTarget(username);
  if (!targetId) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const url = new URL(request.url);
  const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const pool = getPool();
  const rows = await pool.query<FollowEntryRaw>(
    `select
       p.user_id,
       p.display_name,
       p.bio,
       u.image as avatar_url,
       p.equipped_flair,
       p.equipped_frame,
       p.equipped_name_fx,
       coalesce(p.followers_count, 0) as followers_count,
       f.created_at as followed_at,
       case
         when $2::uuid is null then false
         else exists (
           select 1 from follows f2
            where f2.follower_user_id = $2::uuid
              and f2.followed_user_id = p.user_id
         )
       end as viewer_is_following,
       (p.user_id = $2::uuid) as is_viewer,
       p.elo,
       p.current_streak,
       p.best_scan_overall,
       p.matches_won,
       p.subscription_status
       from follows f
       join profiles p on p.user_id = f.followed_user_id
       join users u on u.id = p.user_id
      where f.follower_user_id = $1
      order by f.created_at desc
      limit $3 offset $4`,
    [targetId, viewerId, PAGE_SIZE, offset],
  );

  return NextResponse.json({
    entries: rows.rows.map<FollowEntry>((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      bio: r.bio,
      avatar_url: r.avatar_url,
      equipped_flair: r.equipped_flair,
      equipped_frame: r.equipped_frame,
      equipped_name_fx: r.equipped_name_fx,
      followers_count: r.followers_count,
      followed_at: r.followed_at,
      viewer_is_following: r.viewer_is_following,
      is_viewer: r.is_viewer,
      elo: r.elo,
      current_streak: r.current_streak,
      best_scan_overall: r.best_scan_overall,
      matches_won: r.matches_won,
      is_subscriber:
        r.subscription_status === 'active' || r.subscription_status === 'trialing',
    })),
    has_more: rows.rows.length === PAGE_SIZE,
    page,
  });
}
