'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { AvatarFallback } from './AvatarFallback';
import { Frame } from './customization/Frame';
import { Badge } from './customization/Badge';
import { NameFx } from './customization/NameFx';
import type { UserStats } from '@/lib/customization';

type FollowEntry = {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  equipped_flair: string | null;
  equipped_frame: string | null;
  equipped_name_fx?: string | null;
  followers_count: number;
  followed_at: string;
  viewer_is_following: boolean;
  is_viewer: boolean;
  elo?: number | null;
  current_streak?: number | null;
  best_scan_overall?: number | null;
  matches_won?: number | null;
  is_subscriber?: boolean;
};

type ApiResponse = {
  entries: FollowEntry[];
  has_more: boolean;
  page: number;
};

/**
 * X-style scrollable list of profile rows used by both the followers
 * and following pages. Each row is a tappable link to that user's
 * profile, with an inline follow/unfollow button that updates
 * optimistically. Infinite scroll via IntersectionObserver sentinel.
 */
export function FollowList({
  username,
  kind,
  initial,
}: {
  username: string;
  kind: 'followers' | 'following';
  initial: ApiResponse | null;
}) {
  const [entries, setEntries] = useState<FollowEntry[]>(initial?.entries ?? []);
  const [hasMore, setHasMore] = useState(!!initial?.has_more);
  const [lastLoadedPage, setLastLoadedPage] = useState(
    initial?.entries ? 1 : 0,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number): Promise<ApiResponse | null> => {
      try {
        const res = await fetch(
          `/api/account/${username}/${kind}?page=${page}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return null;
        return (await res.json()) as ApiResponse;
      } catch {
        return null;
      }
    },
    [username, kind],
  );

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const next = lastLoadedPage + 1;
    const data = await fetchPage(next);
    fetchingRef.current = false;
    setLoadingMore(false);
    if (!data) return;
    setEntries((prev) => [...prev, ...data.entries]);
    setHasMore(data.has_more);
    setLastLoadedPage(next);
  }, [fetchPage, hasMore, lastLoadedPage]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  if (entries.length === 0) {
    return (
      <div className="rounded-none border border-white/10 bg-white/[0.02] px-5 py-12 text-center">
        <p className="text-[15px] text-foreground">
          {kind === 'followers' ? 'no followers yet' : 'not following anyone yet'}
        </p>
        <p className="mt-1 text-[13px] text-zinc-400">
          {kind === 'followers'
            ? 'their followers will appear here.'
            : 'accounts they follow will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-white/10 bg-white/[0.02]">
      <ul className="flex flex-col">
        {entries.map((e) => (
          <FollowRow
            key={e.user_id}
            entry={e}
            onFollowChange={(now) =>
              setEntries((prev) =>
                prev.map((row) =>
                  row.user_id === e.user_id
                    ? { ...row, viewer_is_following: now }
                    : row,
                ),
              )
            }
          />
        ))}
      </ul>
      {hasMore && (
        <div
          ref={sentinelRef}
          className="border-t border-white/5 px-5 py-3 text-center"
        >
          <span className="text-[12px] text-zinc-400">
            {loadingMore ? 'loading…' : 'scroll for more'}
          </span>
        </div>
      )}
    </div>
  );
}

function FollowRow({
  entry,
  onFollowChange,
}: {
  entry: FollowEntry;
  onFollowChange: (next: boolean) => void;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [following, setFollowing] = useState(entry.viewer_is_following);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    if (!user) {
      router.push(`/?signin=1&next=${encodeURIComponent(`/@${entry.display_name}`)}`);
      return;
    }
    const next = !following;
    setFollowing(next);
    onFollowChange(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/account/${entry.display_name}/follow`, {
          method: next ? 'POST' : 'DELETE',
        });
        if (!res.ok) {
          setFollowing(!next);
          onFollowChange(!next);
        }
      } catch {
        setFollowing(!next);
        onFollowChange(!next);
      }
    });
  };

  // userStats fields populated by the followers/following API. Smart
  // cosmetics on each row read these for their live data.
  const userStats: UserStats = {
    elo: entry.elo ?? null,
    bestScanOverall: entry.best_scan_overall ?? null,
    currentStreak: entry.current_streak ?? null,
    currentWinStreak: entry.current_streak ?? null,
    matchesWon: entry.matches_won ?? null,
  };
  return (
    <li className="flex items-start gap-3 border-b border-white/5 px-4 py-4 transition-colors last:border-b-0 hover:bg-white/[0.015] sm:gap-4 sm:px-5">
      <Link
        href={`/@${entry.display_name}`}
        className="flex-shrink-0"
        aria-label={`view @${entry.display_name}`}
      >
        <Frame slug={entry.equipped_frame} size={48} userStats={userStats}>
          {entry.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <AvatarFallback seed={entry.display_name} textClassName="text-base" />
          )}
        </Frame>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/@${entry.display_name}`}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="truncate text-[15px] font-bold text-foreground hover:underline underline-offset-2">
            <NameFx
              slug={entry.equipped_name_fx ?? null}
              userStats={userStats}
            >
              {entry.display_name}
            </NameFx>
          </span>
          {entry.equipped_flair && (
            <Badge slug={entry.equipped_flair} userStats={userStats} />
          )}
        </Link>
        <span className="text-[13px] text-zinc-400">@{entry.display_name}</span>
        {entry.bio && (
          <p className="mt-1 line-clamp-2 max-w-md text-[13px] leading-relaxed text-zinc-300">
            {entry.bio}
          </p>
        )}
      </div>

      {!entry.is_viewer && (
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending}
          style={{ touchAction: 'manipulation' }}
          className={
            following
              ? 'inline-flex h-9 flex-shrink-0 items-center rounded-full border border-white/15 px-4 text-[13px] font-semibold text-foreground transition-colors hover:border-white/50 hover:bg-white/10/[0.06] hover:text-white disabled:opacity-50'
              : 'inline-flex h-9 flex-shrink-0 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-[#0a0a0a] transition-transform hover:scale-[1.03] disabled:opacity-50'
          }
        >
          {following ? 'following' : 'follow'}
        </button>
      )}
    </li>
  );
}
