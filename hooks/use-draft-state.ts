'use client';

// useState that survives reloads, crashes (error boundary → "Try again") and
// dropped connections: the value is mirrored to sessionStorage (this tab
// only, cleared when the tab closes). Never use it for secrets or files.
//
//   const [values, setValues, clearDraft] = useDraftState('contact', EMPTY);
//   …after a successful submit: clearDraft();
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'fiduxa_draft:';

export function useDraftState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);
  const storageKey = PREFIX + key;

  // Hydrate after mount (server and first client render stay identical)
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable or corrupt – start empty */
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* quota / private mode – ignore */
    }
  }, [storageKey, value]);

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [value, setValue, clear] as const;
}
