'use client';

import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { AppHeader } from '@/components/AppHeader';
import { AuthModal } from '@/components/AuthModal';
import { AccountStatsTab } from '@/components/AccountStatsTab';
import { AccountHistoryTab } from '@/components/AccountHistoryTab';
import { AccountSettingsTab } from '@/components/AccountSettingsTab';

type Tab = 'stats' | 'history' | 'settings';

export default function AccountPage() {
  const { user, loading } = useUser();
  const [tab, setTab] = useState<Tab>('stats');

  if (loading) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <main className="mx-auto w-full max-w-md px-5 py-8 text-sm text-zinc-500">
          loading…
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-black">
        <AppHeader authNext="/account" />
        <main className="mx-auto w-full max-w-md px-5 py-8">
          <p className="text-sm text-white">sign in to see your account</p>
        </main>
        <AuthModal open onClose={() => {}} next="/account" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        <h1 className="mb-4 text-2xl font-bold text-white">account</h1>

        <nav className="mb-4 flex gap-2 text-sm" aria-label="account tabs">
          {(['stats', 'history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{ touchAction: 'manipulation' }}
              className={`rounded-full px-3 py-1 transition-colors ${
                tab === t
                  ? 'bg-white text-black'
                  : 'border border-white/15 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === 'stats' && <AccountStatsTab />}
        {tab === 'history' && <AccountHistoryTab />}
        {tab === 'settings' && <AccountSettingsTab />}
      </main>
    </div>
  );
}
