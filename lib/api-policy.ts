// Pure rules for the API client (lib/api.ts): how a failure is classified
// and whether it may be retried automatically. No React, no fetch – unit
// tested in tests/unit/api-policy.test.mjs.

export type ApiErrorKind =
  | 'offline' // the browser has no connection
  | 'network' // request never reached the server (DNS, refused, CORS, proxy down)
  | 'timeout' // no answer within the time limit
  | 'maintenance' // 503 MAINTENANCE
  | 'unavailable' // 503 DB_UNAVAILABLE / DB_TIMEOUT / 502 / 504 – service temporarily down
  | 'busy' // 503 SERVER_BUSY or 429 – overloaded, try again shortly
  | 'server' // other 5xx
  | 'client'; // 4xx – the request itself was rejected

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_GET_RETRIES = 2;

/** Classify an HTTP answer (status ≥ 400) by status and the API's `code`. */
export function classifyStatus(status: number, code?: string): ApiErrorKind {
  if (code === 'MAINTENANCE') return 'maintenance';
  if (code === 'SERVER_BUSY' || status === 429) return 'busy';
  if (code === 'DB_UNAVAILABLE' || code === 'DB_TIMEOUT' || status === 502 || status === 503 || status === 504) return 'unavailable';
  if (status >= 500) return 'server';
  return 'client';
}

/** Classify a fetch that threw (no HTTP answer at all). */
export function classifyThrown(error: unknown, { timedOut, online }: { timedOut: boolean; online: boolean }): ApiErrorKind {
  if (timedOut) return 'timeout';
  if (!online) return 'offline';
  void error;
  return 'network';
}

/** Kinds that mean "temporary – trying again later can succeed". */
export const isTransient = (kind: ApiErrorKind) => kind !== 'client';

/**
 * Automatic retry rule. Only safe, idempotent requests are retried:
 * GET always; POST/PUT/PATCH/DELETE only when the caller marks the call as
 * idempotent (an idempotency key or a server-side "settle once" guarantee,
 * e.g. the PayPal capture). Payments/bookings without a key are never repeated.
 * Maintenance and client errors are never retried here.
 */
export function shouldRetry({
  method,
  kind,
  attempt,
  maxRetries,
  idempotent = false,
}: {
  method: HttpMethod;
  kind: ApiErrorKind;
  attempt: number; // 1 = the first try failed
  maxRetries: number;
  idempotent?: boolean;
}): boolean {
  if (attempt > maxRetries) return false;
  if (method !== 'GET' && !idempotent) return false;
  return kind === 'network' || kind === 'timeout' || kind === 'unavailable' || kind === 'busy' || kind === 'server';
}

/** Exponential backoff with jitter: ~0.5 s, 1 s, 2 s … (capped); honours Retry-After. */
export function backoffMs(attempt: number, retryAfterSeconds?: number | null, random = Math.random): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(retryAfterSeconds, 10) * 1000;
  const base = Math.min(8_000, 500 * 2 ** (attempt - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}
