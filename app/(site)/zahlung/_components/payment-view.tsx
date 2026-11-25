'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarPlus,
  CircleAlert,
  CircleCheck,
  Wallet,
  Info,
  LoaderCircle,
  Lock,
  ReceiptText,
  RefreshCw,
  TimerOff,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { Booking, BookingPayment, PaymentMethod, PaymentSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PaymentMethodPicker, payButtonClass, paymentMethodMessages } from '../../_shared/payment-methods';
import { DevPayPalSimulator } from './dev-paypal-simulator';
import messages from '../_messages';
import { HoldCountdown, useCountdown } from './countdown';
import { OrderSummary, PaymentProgress, type PaymentStep } from './payment-shared';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; booking: Booking; summary: PaymentSummary };

type ViewKind = 'pay' | 'unavailable' | 'paid' | 'invoice' | 'processing' | 'expired' | 'cancelled' | 'notPayable';

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Info; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-pine-dark">
        <Icon className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-4 text-sm leading-relaxed text-charcoal">{children}</div>
    </section>
  );
}

function Notice({ tone, children }: { tone: 'amber' | 'red' | 'mint'; children: React.ReactNode }) {
  const styles = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    mint: 'border-sage bg-mint text-pine-dark',
  }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-4 text-sm ${styles}`}>
      {tone === 'mint' ? (
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function PaymentView({ bookingId }: { bookingId: string }) {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  /** silent = keep the current content while refreshing (e.g. after a 409) */
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState({ kind: 'loading' });
      try {
        const [bookingRes, summary] = await Promise.all([
          api.get<{ booking: Booking }>(`/customer/bookings/${encodeURIComponent(bookingId)}`),
          api.get<PaymentSummary & { success: boolean }>(`/payments/booking/${encodeURIComponent(bookingId)}`),
        ]);
        setState({ kind: 'ready', booking: bookingRes.booking, summary });
      } catch (error) {
        if (!silent) setState({ kind: 'error', error });
      }
    },
    [bookingId]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-grey" role="status">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {t.loading}
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="shell py-16">
        <div className="mx-auto max-w-lg">
          <Notice tone="red">
            <p className="m-0">{translateApiError(state.error, locale)}</p>
            <button type="button" onClick={() => load()} className="mt-2 inline-flex items-center gap-1 font-bold underline">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.reload}
            </button>
          </Notice>
        </div>
      </div>
    );
  }

  return <PaymentContent booking={state.booking} summary={state.summary} onRefresh={() => load(true)} />;
}

function PaymentContent({ booking, summary, onRefresh }: { booking: Booking; summary: PaymentSummary; onRefresh: () => void }) {
  const t = useMessages(messages);
  const tp = useMessages(paymentMethodMessages);
  const f = useFormat();
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const aborted = searchParams?.get('abgebrochen') === '1';

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const bookingStatus = summary.bookingStatus ?? booking.status;
  const payment: BookingPayment = summary.payment ?? booking.payment ?? { status: 'unpaid' };
  const paymentStatus = payment.status ?? 'unpaid';
  const holdExpiresAt = summary.holdExpiresAt ?? booking.holdExpiresAt ?? null;
  const countdown = useCountdown(bookingStatus === 'payment_pending' ? holdExpiresAt : null);
  const amountCents = summary.amountCents ?? payment.amountCents ?? booking.estimate?.totalCents ?? null;
  const awaitingPayment = bookingStatus === 'payment_pending' || bookingStatus === 'accepted';
  const methods: PaymentMethod[] = (summary.methods ?? (summary.onlinePaymentAvailable ? ['stripe'] : [])).filter(
    (m): m is PaymentMethod => m === 'stripe' || m === 'paypal'
  );
  // Preselect the method chosen at booking time (or the only one offered)
  const previous = payment.method === 'stripe' || payment.method === 'paypal' ? payment.method : null;
  const [method, setMethod] = useState<PaymentMethod | null>(
    previous && methods.includes(previous) ? previous : methods.length === 1 ? methods[0] : null
  );
  const [methodError, setMethodError] = useState(false);

  let kind: ViewKind;
  if (bookingStatus === 'expired' || (bookingStatus === 'payment_pending' && countdown?.expired)) kind = 'expired';
  else if (bookingStatus === 'cancelled' || paymentStatus === 'refund_pending' || paymentStatus === 'refunded') kind = 'cancelled';
  else if (paymentStatus === 'paid') kind = 'paid';
  else if (paymentStatus === 'pending') kind = 'processing';
  else if (bookingStatus === 'confirmed') kind = 'invoice';
  else if (awaitingPayment) kind = summary.onlinePaymentAvailable ? 'pay' : 'unavailable';
  else kind = 'notPayable';

  const step: PaymentStep = kind === 'paid' || kind === 'invoice' ? 2 : 1;
  const bookingHref = `/konto/buchungen/${booking._id}`;

  const startCheckout = async () => {
    if (submittingRef.current) return;
    if (methods.length > 1 && !method) {
      setMethodError(true);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { url } = await api.post<{ url: string }>('/payments/checkout', {
        bookingId: booking._id,
        ...(method ? { method } : {}),
      });
      // Hosted Stripe checkout / PayPal approval – payment details never touch Fiduxa servers.
      // The button keeps its "redirecting" state until the browser leaves.
      window.location.assign(url);
    } catch (error) {
      setSubmitError(translateApiError(error, locale));
      submittingRef.current = false;
      setSubmitting(false);
      // Expired / already paid / processing → show the current state
      if (error instanceof ApiError && error.status === 409) onRefresh();
    }
  };

  let main: React.ReactNode;

  switch (kind) {
    case 'paid':
      main = (
        <Card title={t.paid.title} icon={CircleCheck}>
          <p className="m-0">{t.paid.text(f.euro(payment.amountCents ?? amountCents), payment.paidAt ? f.dateTime(payment.paidAt) : null)}</p>
          <Link href={bookingHref} className="button button-small mt-5">
            {t.toBooking}
          </Link>
        </Card>
      );
      break;
    case 'invoice':
      main = (
        <Card title={t.invoice.title} icon={ReceiptText}>
          <p className="m-0">{t.invoice.text(f.euro(amountCents))}</p>
          <Link href={bookingHref} className="button button-small mt-5">
            {t.toBooking}
          </Link>
        </Card>
      );
      break;
    case 'processing':
      main = (
        <Card title={t.processing.title} icon={LoaderCircle}>
          <p className="m-0">{t.processing.text}</p>
          <Link href={bookingHref} className="button button-quiet button-small mt-5">
            {t.toBooking}
          </Link>
        </Card>
      );
      break;
    case 'expired':
      main = (
        <Card title={t.expired.title} icon={TimerOff}>
          <p className="m-0">{t.expired.text}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/buchung" className="button button-small">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.expired.cta}
            </Link>
            <Link href={bookingHref} className="button button-quiet button-small">
              {t.toBooking}
            </Link>
          </div>
        </Card>
      );
      break;
    case 'cancelled':
      main = (
        <Card title={t.cancelled.title} icon={ReceiptText}>
          <p className="m-0">{t.cancelled.text}</p>
          {paymentStatus === 'refunded' && <p className="mb-0 mt-2">{t.cancelled.refunded}</p>}
          {paymentStatus === 'refund_pending' && <p className="mb-0 mt-2">{t.cancelled.refundPending}</p>}
          <Link href={bookingHref} className="button button-quiet button-small mt-5">
            {t.toBooking}
          </Link>
        </Card>
      );
      break;
    case 'unavailable':
      main = (
        <Card title={t.pay.unavailableTitle} icon={Info}>
          <p className="m-0">{t.pay.unavailableText}</p>
          <Link href="/kontakt" className="button button-quiet button-small mt-5">
            {t.pay.contact}
          </Link>
        </Card>
      );
      break;
    case 'notPayable':
      main = (
        <Card title={t.notPayable.title} icon={Info}>
          <p className="m-0">{t.notPayable.text}</p>
          <Link href={bookingHref} className="button button-quiet button-small mt-5">
            {t.toBooking}
          </Link>
        </Card>
      );
      break;
    case 'pay':
      main = (
        <>
          {aborted && <Notice tone="amber">{t.pay.aborted}</Notice>}
          {paymentStatus === 'failed' && !aborted && <Notice tone="red">{t.pay.failed}</Notice>}

          {holdExpiresAt && bookingStatus === 'payment_pending' && (
            <section className="rounded-2xl border border-pine bg-mint p-5 sm:p-6" aria-labelledby="hold-title">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 id="hold-title" className="m-0 text-lg font-bold text-pine-dark">
                    {t.pay.holdTitle}
                  </h2>
                  <p className="mb-0 mt-1 text-sm leading-relaxed text-pine-dark/80">{t.pay.holdText}</p>
                </div>
                <div className="shrink-0 rounded-xl bg-white px-4 py-3">
                  <HoldCountdown expiresAt={holdExpiresAt} />
                </div>
              </div>
            </section>
          )}

          <Card title={t.pay.cardTitle} icon={Wallet}>
            <PaymentMethodPicker
              methods={methods}
              value={method}
              onChange={(m) => {
                setMethod(m);
                setMethodError(false);
              }}
              error={methodError ? t.pay.chooseMethod : undefined}
              errorId="pay-method-error"
              disabled={submitting}
            />
            {methodError && (
              <p id="pay-method-error" role="alert" className="mb-0 mt-3 text-sm font-semibold text-red-700">
                {t.pay.chooseMethod}
              </p>
            )}
          </Card>

          {submitError && <Notice tone="red">{submitError}</Notice>}
          {payment.method === 'paypal' && <DevPayPalSimulator bookingId={booking._id} orderId={payment.checkoutSessionId} />}

          <button
            type="button"
            onClick={startCheckout}
            disabled={submitting}
            aria-disabled={submitting}
            className={cn(
              'button w-full justify-center !py-4 !text-base disabled:cursor-wait disabled:opacity-70 sm:w-auto',
              payButtonClass(method)
            )}
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {method ? tp.redirecting[method] : t.pay.redirecting}
              </>
            ) : (
              <>
                <Lock className="h-5 w-5" aria-hidden="true" />{' '}
                {method === 'paypal' ? tp.payWith.paypal(f.euro(amountCents)) : t.pay.button(f.euro(amountCents))}
              </>
            )}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {submitting ? (method ? tp.redirecting[method] : t.pay.redirecting) : ''}
          </span>
        </>
      );
      break;
  }

  return (
    <div className="shell py-10 lg:py-14">
      <Link href={bookingHref} className="text-link">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.backToBooking}
      </Link>

      <div className="mt-6 max-w-2xl">
        <PaymentProgress current={step} />
      </div>

      <h1 className="mb-0 mt-8 text-3xl font-extrabold tracking-tight text-pine-dark sm:text-4xl">{kind === 'paid' ? t.titlePaid : t.titlePay}</h1>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
        <div className="grid min-w-0 gap-5">{main}</div>
        <aside className="lg:sticky lg:top-28">
          <OrderSummary
            booking={booking}
            amountCents={amountCents}
            payable={kind === 'pay'}
            footer={
              <p className="m-0 mt-4 flex items-center gap-2 text-xs text-muted-grey">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t.pay.secure}
              </p>
            }
          />
        </aside>
      </div>
    </div>
  );
}
