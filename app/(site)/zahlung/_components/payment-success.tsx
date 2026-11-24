'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarPlus, CircleCheck, Clock, LoaderCircle, TimerOff } from 'lucide-react';

import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { PaymentSummary } from '@/lib/types';
import messages from '../_messages';
import { PaymentProgress } from './payment-shared';

type View = 'checking' | 'paid' | 'processing' | 'slow' | 'expired' | 'error';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // ~30 seconds

/**
 * Landing page after Stripe redirects back (and after the PayPal capture on
 * /zahlung/paypal). Only `?booking=` is needed. The redirect itself is NOT
 * proof of payment – we poll our API, which only marks a booking as paid after
 * Stripe's signed webhook arrives or PayPal confirmed the capture.
 */
export function PaymentSuccess() {
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const bookingId = searchParams?.get('booking') ?? '';

  const [view, setView] = useState<View>('checking');
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const polls = useRef(0);

  useEffect(() => {
    if (!bookingId) {
      setView('error');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const check = async () => {
      try {
        const result = await api.get<PaymentSummary>(`/payments/booking/${encodeURIComponent(bookingId)}`);
        if (stopped) return;
        setSummary(result);
        const status = result.payment?.status;
        if (status === 'paid') return setView('paid');
        if (status === 'pending') return setView('processing');
        if (result.bookingStatus === 'expired') return setView('expired');
        polls.current += 1;
        if (polls.current >= MAX_POLLS) return setView('slow');
        timer = setTimeout(check, POLL_INTERVAL_MS);
      } catch (err) {
        if (stopped) return;
        setView('error');
        setError(err);
      }
    };

    check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId]);

  const bookingLink = bookingId ? `/konto/buchungen/${encodeURIComponent(bookingId)}` : '/konto';
  const paidAmount = summary?.payment?.amountCents ?? summary?.amountCents ?? null;

  return (
    <div className="shell py-12 lg:py-16">
      <div className="mx-auto max-w-xl">
        <PaymentProgress current={view === 'paid' ? 2 : 1} />

        <section className="mt-8 rounded-2xl border border-border bg-white p-6 text-center sm:p-8" aria-live="polite">
          {view === 'checking' && (
            <div role="status">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-pine" aria-hidden="true" />
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.success.checkingTitle}</h1>
              <p className="mb-0 mt-3 text-sm text-muted-grey">{t.success.checkingText}</p>
            </div>
          )}

          {view === 'paid' && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-pine">
                <CircleCheck className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.success.paidTitle}</h1>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">
                {t.success.paidText(paidAmount ? f.euro(paidAmount) : null, summary?.reference ?? null)}
              </p>
            </>
          )}

          {(view === 'processing' || view === 'slow') && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
                <Clock className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.success.processingTitle}</h1>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">
                {view === 'processing' ? t.success.processingText : t.success.slowText}
              </p>
            </>
          )}

          {view === 'expired' && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream text-muted-grey">
                <TimerOff className="h-8 w-8" aria-hidden="true" />
              </span>
              <h1 className="mb-0 mt-4 text-2xl font-extrabold text-pine-dark">{t.expired.title}</h1>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">{t.expired.text}</p>
              <Link href="/buchung" className="button mx-auto mt-7">
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.expired.cta}
              </Link>
            </>
          )}

          {view === 'error' && (
            <>
              <h1 className="m-0 text-2xl font-extrabold text-pine-dark">{t.success.errorTitle}</h1>
              <p className="mb-0 mt-3 text-sm text-red-700" role="alert">
                {bookingId ? translateApiError(error, locale) : t.success.missing}
              </p>
            </>
          )}

          {view !== 'checking' && view !== 'expired' && (
            <Link href={bookingLink} className="button mx-auto mt-7">
              {t.toBooking}
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
