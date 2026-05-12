import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { FollowList } from '@/components/FollowList';
import { auth } from '@/lib/auth';
import { lookupPublicProfile } from '@/lib/publicProfile';
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
  followers_count: number;
  followed_at: string;
  viewer_is_following: boolean;
  is_viewer: boolean;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} is following` };
}

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const profile = await lookupPublicProfile(username, viewerId);
  if (profile.kind !== 'found') notFound();

  const pool = getPool();
  const rows = await pool.query<FollowEntry>(
    `select
       p.user_id, p.display_name, p.bio,
       u.image as avatar_url,
       p.equipped_flair, p.equipped_frame,
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
       (p.user_id = $2::uuid) as is_viewer
       from follows f
       join profiles p on p.user_id = f.followed_user_id
       join users u on u.id = p.user_id
      where f.follower_user_id = $1
      order by f.created_at desc
      limit $3`,
    [profile.data.user_id, viewerId, PAGE_SIZE],
  );

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-5 py-6 sm:max-w-2xl">
        <header className="mb-5 flex items-center gap-3">
          <Link
            href={`/@${profile.data.display_name}`}
            aria-label="back to profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-foreground"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">
              following
            </h1>
            <span className="text-[14px] text-zinc-400">
              @{profile.data.display_name} · {profile.data.following_count}
            </span>
          </div>
        </header>

        <FollowList
          username={profile.data.display_name}
          kind="following"
          initial={{
            entries: rows.rows,
            has_more: rows.rows.length === PAGE_SIZE,
            page: 1,
          }}
        />
      </main>
    </div>
  );
}
