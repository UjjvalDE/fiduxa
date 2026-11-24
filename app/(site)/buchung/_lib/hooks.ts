'use client';

// Data hooks for the booking wizard. The server is the source of truth for
// catalogue, availability and prices (a client preview only bridges the
// debounce, see preview.ts).
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, qs } from '@/lib/api';
import { useLocale } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { AvailableDay, Condition, Estimate, Extra, Frequency, PublicPricing, Quote, Service, Slot } from '@/lib/types';

interface AsyncState<T> {
  data: T | null;
  /** Path the data was loaded for */
  forPath: string | null;
  loading: boolean;
  /** Raw error – translated at render time so a language switch applies */
  error: unknown;
}

/** Translate a stored raw error into the current language */
function useErrorText(error: unknown): string | null {
  const { locale } = useLocale();
  return error == null ? null : translateApiError(error, locale);
}

/**
 * Generic GET with loading/error/reload; `path` null = idle.
 * The old data is kept while reloading the same resource, or while loading a
 * new path of the same `group` (e.g. the same day with another duration) –
 * `fresh` tells whether `data` belongs to the current path (and is not reloading).
 */
function useGet<T>(path: string | null, group?: string) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, forPath: null, loading: Boolean(path), error: null });
  const [tick, setTick] = useState(0);
  const last = useRef<{ path: string | null; group: string | undefined }>({ path: null, group: undefined });

  useEffect(() => {
    if (!path) {
      last.current = { path: null, group: undefined };
      setState({ data: null, forPath: null, loading: false, error: null });
      return;
    }
    let active = true;
    const keep = last.current.path === path || (group !== undefined && last.current.group === group);
    last.current = { path, group };
    setState((s) => (keep ? { ...s, loading: true, error: null } : { data: null, forPath: null, loading: true, error: null }));
    api
      .get<T>(path)
      .then((data) => active && setState({ data, forPath: path, loading: false, error: null }))
      .catch((error: unknown) => active && setState({ data: null, forPath: null, loading: false, error: error ?? new Error('unknown') }));
    return () => {
      active = false;
    };
  }, [path, group, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const error = useErrorText(state.error);
  const fresh = path !== null && state.forPath === path && !state.loading;
  return { data: state.data, loading: state.loading, error, reload, fresh };
}

export function usePricing() {
  const res = useGet<{ pricing: PublicPricing }>('/pricing');
  return { pricing: res.data?.pricing ?? null, loading: res.loading, error: res.error, reload: res.reload };
}

export function useServiceDetail(serviceId: string | null) {
  const res = useGet<{ service: Service }>(serviceId ? `/services/${encodeURIComponent(serviceId)}` : null);
  const service = res.data?.service && res.data.service.id === serviceId ? res.data.service : null;
  return { service, loading: res.loading, error: res.error, reload: res.reload };
}

export function useExtras(serviceId: string | null) {
  const res = useGet<{ extras: Extra[] }>(serviceId ? `/extras${qs({ serviceId })}` : null);
  return { extras: res.data?.extras ?? null, loading: res.loading, error: res.error, reload: res.reload };
}

/**
 * Days in [from, to] (YYYY-MM-DD) with at least one start time for a job of
 * `duration` minutes. `duration` null = not known yet (idle).
 */
export function useAvailableDays(from: string, to: string, duration: number | null) {
  const res = useGet<{ data: AvailableDay[] }>(duration ? `/bookings/availability/days${qs({ from, to, duration })}` : null, 'days');
  return { days: res.data?.data ?? null, loading: res.loading, error: res.error, reload: res.reload, fresh: res.fresh };
}

/** Start times on `date` where the whole job (`duration` minutes) fits */
export function useAvailability(date: string | null, duration: number | null) {
  const res = useGet<{ data: Slot[] }>(date && duration ? `/bookings/availability${qs({ date, duration })}` : null, date ?? undefined);
  return { slots: res.data?.data ?? null, loading: res.loading, error: res.error, reload: res.reload, fresh: res.fresh };
}

/** `value`, but only after it stopped changing for `delay` ms */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface EstimateInput {
  serviceId: string;
  areaM2: number;
  condition: Condition;
  frequency: Frequency;
  extras: string[];
  /** Only present once the customer changed the hours manually */
  durationMinutes?: number;
}

export interface EstimateState {
  estimate: Estimate | null;
  /** true when `estimate` belongs to the current input */
  isCurrent: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Debounced (400 ms) POST /bookings/estimate whenever the input changes */
export function useEstimate(input: EstimateInput | null): EstimateState {
  const key = input ? JSON.stringify(input) : null;
  const [state, setState] = useState<{ estimate: Estimate | null; forKey: string | null; loading: boolean; error: unknown }>({
    estimate: null,
    forKey: null,
    loading: false,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (!key) {
      setState({ estimate: null, forKey: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post<{ data: Estimate }>('/bookings/estimate', JSON.parse(key));
        if (id === requestId.current) setState({ estimate: res.data, forKey: key, loading: false, error: null });
      } catch (error) {
        if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: error ?? new Error('unknown') }));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [key, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const error = useErrorText(state.error);

  return {
    estimate: state.estimate,
    isCurrent: state.forKey !== null && state.forKey === key,
    loading: state.loading,
    error,
    retry,
  };
}

export interface QuoteInput extends EstimateInput {
  promoCode?: string;
  giftCardCodes?: string[];
  /** For the welcome-offer checks (sent once known) */
  contact?: { email?: string; phone?: string; address?: string; postcode?: string };
}

export interface QuoteState {
  quote: Quote | null;
  /** true when `quote` belongs to the current input (and identity) */
  isCurrent: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** Use a fresh quote returned by the API (409 PRICE_CHANGED, 422 …) for the current input */
  replace: (quote: Quote) => void;
}

/**
 * Debounced POST /bookings/quote – the full, personalised price (welcome offer,
 * campaign or code, VAT, gift cards). `identity` (user id + verified flag)
 * re-requests the quote after login, logout or email confirmation; the API
 * client sends the stored token automatically.
 */
export function useQuote(input: QuoteInput | null, identity: string, delay = 400): QuoteState {
  const key = input ? JSON.stringify([identity, input]) : null;
  const [state, setState] = useState<{ quote: Quote | null; forKey: string | null; loading: boolean; error: unknown }>({
    quote: null,
    forKey: null,
    loading: false,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    const id = ++requestId.current;
    if (!key) {
      setState({ quote: null, forKey: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = window.setTimeout(async () => {
      try {
        const [, body] = JSON.parse(key) as [string, QuoteInput];
        const res = await api.post<{ quote: Quote }>('/bookings/quote', body);
        if (id === requestId.current) setState({ quote: res.quote, forKey: key, loading: false, error: null });
      } catch (error) {
        if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: error ?? new Error('unknown') }));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [key, tick, delay]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const replace = useCallback((quote: Quote) => {
    requestId.current += 1; // drop a request that is still in flight
    setState({ quote, forKey: keyRef.current, loading: false, error: null });
  }, []);
  const error = useErrorText(state.error);

  return {
    quote: state.quote,
    isCurrent: state.forKey !== null && state.forKey === key && !state.loading,
    loading: state.loading,
    error,
    retry,
    replace,
  };
}
