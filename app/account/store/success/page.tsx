import Link from 'next/link';
import { Check } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

/**
 * /account/store/success
 *
 * Stripe Checkout redirects here after a successful payment. The
 * webhook is the source of truth for granting inventory; this page
 * just confirms to the user. We don't read session_id server-side
 * because the webhook is faster + more reliable than client polling.
 */
export default function StoreSuccessPage() {
  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-20 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.06]">
          <Check size={20} className="text-emerald-300" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-white">payment confirmed</h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-400">
          your new item is being delivered. it should appear in your inventory
          within a few seconds — refresh the store if it doesn&apos;t show up.
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            href="/account/store"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-100"
          >
            back to store
          </Link>
          <Link
            href="/account"
            className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            equip in settings
          </Link>
        </div>
      </main>
    </div>
  );
}
