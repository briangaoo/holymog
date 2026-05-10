import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

/**
 * /account/store/cancel
 *
 * Stripe Checkout redirects here when the user backs out of payment.
 * No-op page — just a friendly "you didn't get charged, here's the
 * way back".
 */
export default function StoreCancelPage() {
  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-20 text-center">
        <h1 className="text-xl font-bold text-white">checkout cancelled</h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-400">
          no charges made. nothing in your inventory changed.
        </p>
        <div className="mt-6">
          <Link
            href="/account/store"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-100"
          >
            <ArrowLeft size={14} aria-hidden />
            back to store
          </Link>
        </div>
      </main>
    </div>
  );
}
