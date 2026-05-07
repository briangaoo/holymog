'use client';

import { useCallback, useState } from 'react';

const KEY_STORAGE = 'holymog-account-key';
const NAME_STORAGE = 'holymog-account-name';
const PHOTO_STORAGE = 'holymog-account-photo-pref';
const OVERALL_STORAGE = 'holymog-account-overall';

export type AccountSummary = {
  name: string;
  overall: number;
  tier: string;
  sub: { jawline: number; eyes: number; skin: number; cheekbones: number };
  hasPhoto: boolean;
  imageUrl: string | null;
};

type Saved = {
  key: string;
  name: string;
  photoPref: boolean;
  overall: number;
};

function readStored(): Partial<Saved> {
  if (typeof window === 'undefined') return {};
  try {
    const key = window.localStorage.getItem(KEY_STORAGE);
    const name = window.localStorage.getItem(NAME_STORAGE);
    const photo = window.localStorage.getItem(PHOTO_STORAGE);
    const overall = window.localStorage.getItem(OVERALL_STORAGE);
    const overallNum = overall != null ? Number(overall) : NaN;
    return {
      key: key ?? undefined,
      name: name ?? undefined,
      photoPref: photo === '1' ? true : photo === '0' ? false : undefined,
      overall: Number.isFinite(overallNum) ? overallNum : undefined,
    };
  } catch {
    return {};
  }
}

export function useAccount() {
  // Lazy initializers run synchronously on the very first render, so consumers
  // can use these values without waiting for an effect (= no 100ms flash on
  // modal open).
  const [storedKey, setStoredKey] = useState<string | null>(
    () => readStored().key ?? null,
  );
  const [storedName, setStoredName] = useState<string>(
    () => readStored().name ?? '',
  );
  const [storedPhotoPref, setStoredPhotoPref] = useState<boolean>(
    () => readStored().photoPref ?? false,
  );
  const [storedOverall, setStoredOverall] = useState<number | null>(() => {
    const v = readStored().overall;
    return typeof v === 'number' ? v : null;
  });

  const saveAccount = useCallback((next: Saved) => {
    setStoredKey(next.key);
    setStoredName(next.name);
    setStoredPhotoPref(next.photoPref);
    setStoredOverall(next.overall);
    try {
      window.localStorage.setItem(KEY_STORAGE, next.key);
      window.localStorage.setItem(NAME_STORAGE, next.name);
      window.localStorage.setItem(PHOTO_STORAGE, next.photoPref ? '1' : '0');
      window.localStorage.setItem(OVERALL_STORAGE, String(next.overall));
    } catch {
      // ignore quota / private mode
    }
  }, []);

  const clearAccount = useCallback(() => {
    setStoredKey(null);
    setStoredName('');
    setStoredPhotoPref(false);
    setStoredOverall(null);
    try {
      window.localStorage.removeItem(KEY_STORAGE);
      window.localStorage.removeItem(NAME_STORAGE);
      window.localStorage.removeItem(PHOTO_STORAGE);
      window.localStorage.removeItem(OVERALL_STORAGE);
    } catch {
      // ignore
    }
  }, []);

  return {
    storedKey,
    storedName,
    storedPhotoPref,
    storedOverall,
    saveAccount,
    clearAccount,
  };
}

/** Look up an account by key. Returns null on 404, throws on other errors. */
export async function fetchAccount(key: string): Promise<AccountSummary | null> {
  const res = await fetch(`/api/account/${encodeURIComponent(key)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `account_lookup_failed_${res.status}`);
  }
  return (await res.json()) as AccountSummary;
}
