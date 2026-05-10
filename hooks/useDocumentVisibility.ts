'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive `document.visibilityState`. Returns `true` when the tab is
 * visible, `false` when hidden. Shader components pause their RAF
 * loop when this returns false so we're not burning GPU on a
 * background tab.
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
