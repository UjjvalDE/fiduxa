// Typed fetch client for the Fiduxa Express API.
//
// Usage:
//   const { data } = await api.get<{ services: Service[] }>('/services');
//   await api.post('/bookings', body);            // sends the stored token automatically
//
// Errors throw ApiError with `status`, `message` (German-friendly if the server
// sent one) and optional `details` (field-level validation messages).

import {
  DEFAULT_GET_RETRIES,
  DEFAULT_TIMEOUT_MS,
  backoffMs,
  classifyStatus,
  classifyThrown,
  shouldRetry,
  type ApiErrorKind,
} from './api-policy';

export type { ApiErrorKind } from './api-policy';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');

/** Absolute API URL for full-page navigations (e.g. social login redirects) */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

export const TOKEN_STORAGE_KEY = 'fiduxa_token';

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  /** network | offline | timeout | maintenance | unavailable | busy | server | client */
  kind: ApiErrorKind;
  details?: FieldError[] | Record<string, unknown>;
  /** Full JSON error body (e.g. `code`, `reason`, a fresh `quote`) */
  body?: Record<string, unknown>;

  constructor(status: number, message: string, details?: ApiError['details'], body?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.body = body;
    this.kind = status === 0 ? 'network' : classifyStatus(status, typeof body?.code === 'string' ? body.code : undefined);
  }

  /** True when trying again later can succeed (not a 4xx validation/permission error) */
  get transient(): boolean {
    return this.kind !== 'client';
  }

  /** Machine-readable error code sent by the API (e.g. "PRICE_CHANGED") */
  get code(): string | undefined {
    return typeof this.body?.code === 'string' ? this.body.code : undefined;
  }

  /** Map of field path → message, for showing errors next to inputs */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

// The session now lives in an HttpOnly cookie set by the API (24 h max).
// The token below is kept ONLY in memory for the current tab: it is never
// written to localStorage (XSS cannot read HttpOnly cookies or steal a
// persisted token). After a reload the cookie alone authenticates requests.
let memoryToken: string | null = null;
let legacyCleaned = false;

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  if (!legacyCleaned) {
    legacyCleaned = true;
    try {
      // One-time migration: drop tokens persisted by earlier versions
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* storage unavailable – ignore */
    }
  }
  return memoryToken;
};

export const setStoredToken = (token: string | null) => {
  memoryToken = token;
};

// Listeners notified when the API reports an expired/invalid session (401)
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export const onUnauthorized = (listener: UnauthorizedListener) => {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
};

// Listeners notified when the API answers 409 PROFILE_INCOMPLETE (social
// sign-up without phone/address/consents → completion page)
const profileIncompleteListeners = new Set<() => void>();
export const onProfileIncomplete = (listener: () => void) => {
  profileIncompleteListeners.add(listener);
  return () => {
    profileIncompleteListeners.delete(listener);
  };
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Extra options for one call (on top of fetch's RequestInit) */
export interface ApiRequestOptions {
  /** Abort after this many ms (default 20 s) */
  timeoutMs?: number;
  /** Automatic retries for transient failures (GET default 2, others 0) */
  retries?: number;
  /** The server guarantees "at most once" (idempotency key / settle-once) – allows retries for non-GET */
  idempotent?: boolean;
}

// ---------- Service status (offline / maintenance / DB down) ----------
// The UI (componets/site/network-status.tsx) listens to this to show the
// offline banner or the "temporarily unavailable" state and to poll /ready.
export type ServiceSignal = { kind: ApiErrorKind | 'ok'; retryAfter?: number };
type ServiceListener = (signal: ServiceSignal) => void;
const serviceListeners = new Set<ServiceListener>();
export const onServiceSignal = (listener: ServiceListener) => {
  serviceListeners.add(listener);
  return () => {
    serviceListeners.delete(listener);
  };
};
const emitService = (signal: ServiceSignal) => serviceListeners.forEach((listener) => listener(signal));

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** URL of the readiness probe (proxied like the API) */
export const readyUrl = () => `${API_BASE}/ready`;

const FRIENDLY: Record<ApiErrorKind, string> = {
  offline: 'Du bist offline. Bitte prüfe deine Internetverbindung – wir versuchen es automatisch erneut.',
  network: 'Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.',
  timeout: 'Der Server antwortet gerade nicht. Bitte versuche es gleich noch einmal.',
  maintenance: 'Fiduxa wird gerade gewartet. Bitte versuche es in ein paar Minuten erneut.',
  unavailable: 'Der Dienst ist vorübergehend nicht verfügbar. Bitte versuche es gleich noch einmal.',
  busy: 'Gerade ist sehr viel los. Bitte versuche es in ein paar Sekunden erneut.',
  server: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  client: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
};

async function attempt<T>(method: Method, path: string, body: unknown, init: RequestInit & ApiRequestOptions): Promise<T> {
  const token = getStoredToken();
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries: _r, idempotent: _i, signal: outerSignal, ...fetchInit } = init;
  void _r;
  void _i;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener('abort', onOuterAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      ...fetchInit,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...fetchInit.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    // The caller cancelled on purpose – pass the AbortError through untouched
    if (outerSignal?.aborted) throw error;
    const kind = classifyThrown(error, { timedOut, online: isOnline() });
    const apiError = new ApiError(0, FRIENDLY[kind]);
    apiError.kind = kind;
    emitService({ kind });
    throw apiError;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onOuterAbort);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    if (response.status === 409 && payload?.code === 'PROFILE_INCOMPLETE') {
      profileIncompleteListeners.forEach((listener) => listener());
    }
    const kind = classifyStatus(response.status, typeof payload?.code === 'string' ? payload.code : undefined);
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    if (kind === 'maintenance' || kind === 'unavailable') emitService({ kind, retryAfter });
    const serverMessage = payload && typeof payload.message === 'string' ? payload.message : '';
    const message =
      kind === 'client' ? serverMessage || FRIENDLY.client : response.status === 429 ? 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.' : FRIENDLY[kind];
    const apiError = new ApiError(response.status, message, payload?.details, payload && typeof payload === 'object' ? payload : undefined);
    (apiError as ApiError & { retryAfter?: number }).retryAfter = retryAfter;
    throw apiError;
  }

  emitService({ kind: 'ok' });
  return payload as T;
}

async function request<T>(method: Method, path: string, body?: unknown, init: RequestInit & ApiRequestOptions = {}): Promise<T> {
  const maxRetries = init.retries ?? (method === 'GET' ? DEFAULT_GET_RETRIES : 0);
  for (let n = 1; ; n++) {
    try {
      return await attempt<T>(method, path, body, init);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // Offline: no point hammering – the UI retries when the connection is back
      if (error.kind === 'offline' || !shouldRetry({ method, kind: error.kind, attempt: n, maxRetries, idempotent: init.idempotent })) throw error;
      await sleep(backoffMs(n, (error as ApiError & { retryAfter?: number }).retryAfter));
    }
  }
}

export const api = {
  get: <T>(path: string, init?: RequestInit & ApiRequestOptions) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit & ApiRequestOptions) => request<T>('POST', path, body ?? {}, init),
  put: <T>(path: string, body?: unknown, init?: RequestInit & ApiRequestOptions) => request<T>('PUT', path, body ?? {}, init),
  patch: <T>(path: string, body?: unknown, init?: RequestInit & ApiRequestOptions) => request<T>('PATCH', path, body ?? {}, init),
  delete: <T>(path: string, init?: RequestInit & ApiRequestOptions) => request<T>('DELETE', path, undefined, init),
  /** DELETE with a JSON body (e.g. account deletion confirmation) */
  deleteWithBody: <T>(path: string, body: unknown) => request<T>('DELETE', path, body),
};

/** Build a query string, skipping empty values */
export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

/** Human-readable message for any thrown value */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';

// [customer feedback / extra time / invoices]
/** Download a protected file (e.g. invoice PDF) with the session and save it */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, 'Download failed.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
