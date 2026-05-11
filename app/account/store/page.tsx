import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Launch 1: the store is deferred (no monetization, no paid cosmetics,
 * no holymog+). Achievement-gated badges + name fx are equipped from
 * /account → settings → customization instead.
 *
 * Redirect keeps inbound links functional; the store route comes back
 * when monetization ships in Launch 2.
 */
export default function StorePage() {
  redirect('/account');
}
