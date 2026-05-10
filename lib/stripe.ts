import Stripe from 'stripe';

let cached: Stripe | null = null;

/**
 * Server-side Stripe client. Lazily constructed so the import doesn't
 * crash route handlers in environments without STRIPE_SECRET_KEY (e.g.
 * local dev with checkout disabled). Returns null when the key is
 * missing — callers should handle that path explicitly.
 */
export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, {
    apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function appUrlFor(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://holymog.vercel.app';
  return `${base.replace(/\/$/, '')}${path}`;
}
