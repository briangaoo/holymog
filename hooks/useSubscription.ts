'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';

type SubscriptionState = {
  active: boolean;
  tier: 'plus' | null;
  periodEnd: string | null;
  /** True while we're checking. <AdSlot> defaults to hidden during the
   *  loading window — better to flash empty space than flash an ad to
   *  a paying subscriber. */
  loading: boolean;
};

const INITIAL: SubscriptionState = {
  active: false,
  tier: null,
  periodEnd: null,
  loading: true,
};

/**
 * Client-side hook returning the current user's subscription state.
 * One-shot fetch on mount + on user.id change. The server is the
 * source of truth — this is for UI gating only.
 *
 * Drives:
 *   - AdSlot (hidden when active=true)
 *   - SubscriberBadge on your own display name
 *   - Sub-only store CTAs ("subscribe to unlock" vs "equip")
 *   - 20% strike-through pricing on the storefront
 *   - Monthly claim banner visibility
 */
export function useSubscription(): SubscriptionState {
  const { user, loading: userLoading } = useUser();
  const [state, setState] = useState<SubscriptionState>(INITIAL);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setState({ active: false, tier: null, periodEnd: null, loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setState({ active: false, tier: null, periodEnd: null, loading: false });
          }
          return;
        }
        const data = (await res.json()) as {
          profile: {
            subscription_status: string | null;
            subscription_tier: string | null;
            subscription_current_period_end: string | null;
          } | null;
        };
        if (cancelled) return;
        const status = data.profile?.subscription_status ?? null;
        const active = status === 'active' || status === 'trialing';
        setState({
          active,
          tier: active ? 'plus' : null,
          periodEnd: data.profile?.subscription_current_period_end ?? null,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setState({ active: false, tier: null, periodEnd: null, loading: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, userLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
