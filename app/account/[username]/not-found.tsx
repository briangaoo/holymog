import Link from 'next/link';
import { Search } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-20 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Search size={18} className="text-zinc-300" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-white">profile not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          this user doesn&apos;t exist, or hasn&apos;t set their username yet.
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            href="/leaderboard"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-100"
          >
            browse leaderboard
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            go home
          </Link>
        </div>
      </main>
    </div>
  );
}
