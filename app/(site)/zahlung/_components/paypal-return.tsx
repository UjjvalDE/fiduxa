'use client';

// Return page after PayPal approval: captures the order exactly once, then
// hands over to the regular status page (/zahlung/erfolg), which polls the
// booking's payment status.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarPlus, CircleAlert, LoaderCircle, RefreshCw, TimerOff } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { PaymentSummary } from '@/lib/types';
import messages from '../_messages';
import { PaymentProgress } from './payment-shared';
import { DevPayPalSimulator } from './dev-paypal-simulator';
import { useOnRecovered } from '@/componets/resilience/network-status';

type View =
  | { kind: 'confirming' }
  | { kind: 'checking' } // connection dropped – re-checking (capture is idempotent on the server)
  | { kind: 'failed' | 'expired' | 'error'; error: unknown }
  | { kind: 'missing' };

// How long we keep re-checking automatically after a dropped connection
const CHECK_DELAYS_MS = [3_000, 5_000, 8_000, 12_000, 20_000, 30_000];
const MAX_CHECKS = 20;

const OBJECT_ID = /^[a-f\d]{24}$/i;
const ORDER_ID = /^[A-Z0-9-]{5,64}$/i;

export function PayPalReturn() {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams?.get('booking') ?? '';
  const orderId = searchParams?.get('token') ?? '';
  const valid = OBJECT_ID.test(bookingId) && ORDER_ID.test(orderId);

  const [view, setView] = useState<View>(valid ? { kind: 'confirming' } : { kind: 'missing' });
  // Strict mode runs effects twice in development – never capture twice
  const started = useRef(false);
  const inFlight = useRef(false);
  const checks = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The capture endpoint is idempotent on the server (lock per order, an
  // already paid payment is never captured again, PayPal-Request-Id per order),
  // so repeating it after a dropped connection only re-checks the status –
  // it can never charge twice.
  const capture = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    api
      .post<PaymentSummary>('/payments/paypal/capture', { bookingId, orderId }, { idempotent: true, retries: 2, timeoutMs: 45_000 })
      .then(() => {
        // Paid (or pending review at PayPal): the status page shows the result
        router.replace(`/zahlung/erfolg?booking=${encodeURIComponent(bookingId)}`);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.transient && checks.current < MAX_CHECKS) {
          // Connection / server problem: we do not know the outcome yet → keep checking
          setView({ kind: 'checking' });
          const delay = CHECK_DELAYS_MS[Math.min(checks.current, CHECK_DELAYS_MS.length - 1)];
          checks.current++;
          retryTimer.current = setTimeout(capture, delay);
          return;
        }
        const status = error instanceof ApiError ? error.status : 0;
        // 409 is "reservation expired / cancelled" – except an amount mismatch ("could not be verified")
        const expired = status === 409 && !/verified/i.test(error instanceof Error ? error.message : '');
        setView({ kind: status === 402 ? 'failed' : expired ? 'expired' : 'error', error });
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [bookingId, orderId, router]);

  useEffect(() => {
    if (!valid || started.current) return;
    started.current = true;
    capture();
  }, [valid, capture]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // Connection back → check right away instead of waiting for the next tick
  useOnRecovered(() => {
    if (view.kind === 'checking') capture();
  });

  const payHref = `/zahlung/${encodeURIComponent(bookingId)}`;
  const bookingHref = bookingId ? `/konto/buchungen/${encodeURIComponent(bookingId)}` : '/konto';

  return (
    <div className="shell py-12 lg:py-16">
      <div className="mx-auto max-w-xl">
        <PaymentProgress current={1} />

        <section className="mt-8 rounded-2xl border border-border bg-white p-6 text-center sm:p-8" aria-live="polite">
          {view.kind === 'confirming' && (
            <div role="status">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-pine" aria-hidden="true" />
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.paypal.confirmingTitle}</h1>
              <p className="mb-0 mt-3 text-sm text-muted-grey">{t.paypal.confirmingText}</p>
            </div>
          )}

          {view.kind === 'checking' && (
            <div role="status">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-pine" aria-hidden="true" />
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.paypal.checkingTitle}</h1>
              <p className="mb-0 mt-3 text-sm text-muted-grey">{t.paypal.checkingText}</p>
              <button
                type="button"
                className="button button-quiet mt-6"
                onClick={() => {
                  checks.current = 0;
                  capture();
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.paypal.checkNow}
              </button>
            </div>
          )}

          {view.kind === 'failed' && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
                <CircleAlert className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.paypal.failedTitle}</h1>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-red-700" role="alert">
                {translateApiError(view.error, locale)}
              </p>
              <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{t.paypal.failedText}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href={payHref} className="button">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.paypal.retry}
                </Link>
                <Link href={bookingHref} className="button button-quiet">
                  {t.paypal.toBooking}
                </Link>
              </div>
              <DevPayPalSimulator bookingId={bookingId} orderId={orderId} />
            </>
          )}

          {view.kind === 'expired' && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream text-muted-grey">
                <TimerOff className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.paypal.expiredTitle}</h1>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey" role="alert">
                {translateApiError(view.error, locale) || t.paypal.expiredText}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/buchung" className="button">
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.paypal.newSlot}
                </Link>
                <Link href={bookingHref} className="button button-quiet">
                  {t.paypal.toBooking}
                </Link>
              </div>
            </>
          )}

          {(view.kind === 'error' || view.kind === 'missing') && (
            <>
              <h1 className="m-0 text-2xl font-extrabold text-pine-dark">{t.paypal.errorTitle}</h1>
              <p className="mb-0 mt-3 text-sm text-red-700" role="alert">
                {view.kind === 'missing' ? t.paypal.missing : translateApiError(view.error, locale)}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {OBJECT_ID.test(bookingId) && (
                  <Link href={payHref} className="button">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.paypal.retry}
                  </Link>
                )}
                <Link href={bookingHref} className="button button-quiet">
                  {t.paypal.toBooking}
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
