// Typed fetch client for the Fiduxa Express API.
//
// Usage:
//   const { data } = await api.get<{ services: Service[] }>('/services');
//   await api.post('/bookings', body);            // sends the stored token automatically
//
// Errors throw ApiError with `status`, `message` (German-friendly if the server
// sent one) and optional `details` (field-level validation messages).

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
  details?: FieldError[] | Record<string, unknown>;
  /** Full JSON error body (e.g. `code`, `reason`, a fresh `quote`) */
  body?: Record<string, unknown>;

  constructor(status: number, message: string, details?: ApiError['details'], body?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.body = body;
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

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const token = getStoredToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    const message =
      (payload && typeof payload.message === 'string' && payload.message) ||
      (response.status === 429
        ? 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.'
        : 'Etwas ist schiefgelaufen. Bitte versuche es erneut.');
    throw new ApiError(response.status, message, payload?.details, payload && typeof payload === 'object' ? payload : undefined);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body ?? {}, init),
  put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('PUT', path, body ?? {}, init),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('PATCH', path, body ?? {}, init),
  delete: <T>(path: string, init?: RequestInit) => request<T>('DELETE', path, undefined, init),
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
