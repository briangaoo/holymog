import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import { PublicProfileView } from '@/components/PublicProfileView';
import { lookupPublicProfile } from '@/lib/publicProfile';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const result = await lookupPublicProfile(username);
  if (result.kind !== 'found') {
    return { title: 'profile not found · holymog' };
  }
  const { display_name, bio, best_scan_overall } = result.data;
  const tier = best_scan_overall !== null ? overallToTier(best_scan_overall) : null;
  const titleSuffix = tier ? ` · ${tier} on holymog` : ' · holymog';
  return {
    title: `@${display_name}${titleSuffix}`,
    description:
      bio ?? `${display_name}'s holymog profile — scan, battle, mog.`,
    openGraph: {
      title: `@${display_name}${titleSuffix}`,
      description: bio ?? undefined,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // Pull the signed-in viewer (if any) so the profile page can
  // compute is_own_profile + viewer_is_following server-side. Avoids
  // a client-side flicker for the follow button state.
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const result = await lookupPublicProfile(username, viewerId);
  if (result.kind === 'not_found') notFound();
  if (result.kind === 'redirect') {
    redirect(`/@${result.canonical_username}`);
  }

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-5 py-6 sm:max-w-2xl">
        <PublicProfileView data={result.data} />
      </main>
    </div>
  );
}

function overallToTier(overall: number): string {
  if (overall >= 95) return 'S+';
  if (overall >= 90) return 'S';
  if (overall >= 87) return 'S-';
  if (overall >= 83) return 'A+';
  if (overall >= 78) return 'A';
  if (overall >= 73) return 'A-';
  if (overall >= 68) return 'B+';
  if (overall >= 63) return 'B';
  if (overall >= 58) return 'B-';
  if (overall >= 53) return 'C+';
  if (overall >= 48) return 'C';
  if (overall >= 43) return 'C-';
  if (overall >= 38) return 'D+';
  if (overall >= 33) return 'D';
  if (overall >= 28) return 'D-';
  if (overall >= 18) return 'F+';
  if (overall >= 8) return 'F';
  return 'F-';
}
