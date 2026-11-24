'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { api, ApiError, qs } from '@/lib/api';
import { useLocale } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/config';
import { translateApiError, translateApiMessage } from '@/lib/i18n/api-errors';

// ---------------------------------------------------------------------------
// Server messages are English – translate them into the UI language.
// ---------------------------------------------------------------------------

/** Translated, user-facing message for a raw API message */
export function apiMessage(message: string, locale: Locale): string {
  return translateApiMessage(message, locale);
}

/** Translated, user-facing message for any thrown value */
export function apiErrorMessage(error: unknown, locale: Locale): string {
  return translateApiError(error, locale);
}

/** Hook: `const errorText = useErrorText(); toast.error(errorText(err));` */
export function useErrorText() {
  const { locale } = useLocale();
  return useCallback((error: unknown) => translateApiError(error, locale), [locale]);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  errorStatus: number | null;
  loading: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** GET `path` (null = skip). Keeps the previous data while reloading. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [rawError, setRawError] = useState<unknown>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const { locale } = useLocale();
  // Translate at render time so the message follows language switches
  const error = rawError ? translateApiError(rawError, locale) : null;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRawError(null);
    setErrorStatus(null);
    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRawError(err ?? new Error('unknown'));
        setErrorStatus(err instanceof ApiError ? err.status : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, errorStatus, loading, reload, setData };
}

// ---------------------------------------------------------------------------
// URL query state for filterable lists
// ---------------------------------------------------------------------------

export function useQueryParams<K extends string>(keys: readonly K[]) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const keysRef = useRef(keys);

  const values = {} as Record<K, string>;
  keys.forEach((key) => {
    values[key] = searchParams.get(key) ?? '';
  });

  /** Merge `patch` into the URL. Changing any filter resets `page` unless set. */
  const setParams = useCallback(
    (patch: Partial<Record<K | 'page', string | number | null>>) => {
      const next: Record<string, string> = {};
      keysRef.current.forEach((key) => {
        const value = searchParams.get(key);
        if (value) next[key] = value;
      });
      const pageCurrent = searchParams.get('page');
      if (pageCurrent) next.page = pageCurrent;
      if (!('page' in patch)) delete next.page;
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') delete next[key];
        else next[key] = String(value);
      });
      router.replace(`${pathname}${qs(next)}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return { values, setParams };
}

/** Today's calendar day in Berlin as YYYY-MM-DD */
export const berlinToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
