'use client';

// Connection & service status for the whole app (site, /konto, /worker, /admin).
//
//   - offline: navigator.onLine / "offline" events or a request that failed
//     while the browser had no connection → calm banner at the bottom
//   - unreachable / unavailable: the API could not be reached or answered 503
//     DB_UNAVAILABLE → banner + polling of /ready with backoff
//   - maintenance: 503 MAINTENANCE → full maintenance page (not under /admin,
//     admins keep working), polling /ready until maintenance ends
//
// When the connection/service comes back, a "fiduxa:recovered" window event
// fires (useOnRecovered) and server components are refreshed. Form state is
// never touched – the banner only overlays the page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CloudOff, LoaderCircle, RefreshCw, ServerCrash, Wrench } from 'lucide-react';

import { onServiceSignal, readyUrl } from '@/lib/api';
import { useMessages } from '@/lib/i18n/client';
import messages from './messages';

export type ServiceState = 'ok' | 'offline' | 'unreachable' | 'unavailable' | 'maintenance';

interface NetworkStatusValue {
  /** Browser has a connection (navigator.onLine and no recent offline failure) */
  online: boolean;
  state: ServiceState;
  /** True when submitting/paying makes no sense right now */
  blocked: boolean;
  retryNow: () => void;
}

const NetworkStatusContext = createContext<NetworkStatusValue>({ online: true, state: 'ok', blocked: false, retryNow: () => undefined });

export const useNetworkStatus = () => useContext(NetworkStatusContext);

export const RECOVERED_EVENT = 'fiduxa:recovered';

/** Run `callback` whenever the connection or the service comes back (e.g. reload data). */
export function useOnRecovered(callback: () => void) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(RECOVERED_EVENT, handler);
    return () => window.removeEventListener(RECOVERED_EVENT, handler);
  }, []);
}

const POLL_STEPS_MS = [3_000, 5_000, 10_000, 20_000, 30_000];

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const t = useMessages(messages);
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [online, setOnline] = useState(true);
  const [state, setState] = useState<ServiceState>('ok');
  const [checking, setChecking] = useState(false);
  const [justRecovered, setJustRecovered] = useState(false);
  const stateRef = useRef<ServiceState>('ok');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStep = useRef(0);

  const update = useCallback((next: ServiceState) => {
    const previous = stateRef.current;
    if (previous === next) return;
    stateRef.current = next;
    setState(next);
    if (next === 'ok' && previous !== 'ok') {
      setJustRecovered(true);
      setTimeout(() => setJustRecovered(false), 3_000);
      window.dispatchEvent(new Event(RECOVERED_EVENT));
      router.refresh();
    }
  }, [router]);

  const checkReady = useCallback(async () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      update('offline');
      return;
    }
    setChecking(true);
    let next: ServiceState;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(readyUrl(), { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timer));
      const body = (await res.json().catch(() => ({}))) as { maintenance?: boolean };
      next = body.maintenance ? 'maintenance' : res.ok ? 'ok' : 'unavailable';
    } catch {
      next = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unreachable';
    }
    setChecking(false);
    update(next);
    if (next !== 'ok') {
      const delay = POLL_STEPS_MS[Math.min(pollStep.current, POLL_STEPS_MS.length - 1)];
      pollStep.current++;
      pollTimer.current = setTimeout(checkReady, delay);
    } else {
      pollStep.current = 0;
    }
  }, [update]);

  // Browser connectivity
  useEffect(() => {
    setOnline(navigator.onLine !== false);
    if (navigator.onLine === false) update('offline');
    const goOffline = () => {
      setOnline(false);
      update('offline');
    };
    const goOnline = () => {
      setOnline(true);
      pollStep.current = 0;
      void checkReady();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [checkReady, update]);

  // Signals from lib/api.ts
  useEffect(
    () =>
      onServiceSignal(({ kind }) => {
        if (kind === 'ok') {
          if (stateRef.current !== 'ok' && stateRef.current !== 'maintenance') update('ok');
          return;
        }
        if (kind === 'offline') {
          setOnline(false);
          update('offline');
          if (!pollTimer.current) pollTimer.current = setTimeout(checkReady, POLL_STEPS_MS[0]);
          return;
        }
        if (kind === 'maintenance' || kind === 'unavailable' || kind === 'network' || kind === 'timeout') {
          if (kind === 'maintenance') update('maintenance');
          else if (stateRef.current === 'ok') update(kind === 'unavailable' ? 'unavailable' : 'unreachable');
          if (!pollTimer.current) pollTimer.current = setTimeout(checkReady, 1_500);
        }
      }),
    [checkReady, update]
  );

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const retryNow = useCallback(() => {
    pollStep.current = 0;
    void checkReady();
  }, [checkReady]);

  const value = useMemo<NetworkStatusValue>(
    () => ({ online: online && state !== 'offline', state, blocked: state !== 'ok', retryNow }),
    [online, state, retryNow]
  );

  const isAdmin = pathname.startsWith('/admin');
  const showMaintenancePage = state === 'maintenance' && !isAdmin;

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
      {showMaintenancePage && <MaintenancePage onRetry={retryNow} checking={checking} />}
      {state !== 'ok' && !showMaintenancePage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4" role="status" aria-live="polite">
          <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-pine-dark shadow-lg">
            {state === 'offline' ? (
              <CloudOff className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            ) : state === 'maintenance' ? (
              <Wrench className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            ) : (
              <ServerCrash className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="m-0 font-semibold">
                {state === 'offline' ? t.offline : state === 'unreachable' ? t.unreachable : state === 'maintenance' ? t.maintenanceTitle : t.unavailable}
              </p>
              {state === 'offline' && <p className="m-0 text-xs text-muted-grey">{t.offlineHint}</p>}
            </div>
            {state !== 'offline' && (
              <button type="button" onClick={retryNow} disabled={checking} className="button button-quiet shrink-0 px-3 py-1.5 text-xs">
                {checking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                {checking ? t.checking : t.retryNow}
              </button>
            )}
          </div>
        </div>
      )}
      {state === 'ok' && justRecovered && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4" role="status" aria-live="polite">
          <div className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-pine shadow-lg">{t.back}</div>
        </div>
      )}
    </NetworkStatusContext.Provider>
  );
}

function MaintenancePage({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  const t = useMessages(messages);
  return (
    <main className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-cream px-4 py-16" role="alertdialog" aria-modal="true">
      <section className="max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
          <Wrench className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mb-0 mt-5 text-2xl font-extrabold text-pine-dark">{t.maintenanceTitle}</h1>
        <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">{t.maintenanceText}</p>
        <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{t.maintenanceNote}</p>
        <button type="button" className="button mt-6" onClick={onRetry} disabled={checking}>
          {checking ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {t.retryNow}
        </button>
      </section>
    </main>
  );
}

/** Short note for disabled submit/pay buttons while offline or the service is down. */
export function OfflineActionNote({ className = '', id }: { className?: string; id?: string }) {
  const { blocked } = useNetworkStatus();
  const t = useMessages(messages);
  if (!blocked) return null;
  return (
    <p id={id} className={`m-0 flex items-center gap-2 text-sm text-amber-800 ${className}`} role="status">
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" /> {t.offlineAction}
    </p>
  );
}
