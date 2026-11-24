'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';

import { StatusBadge } from '@/componets/site/status-badge';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Booking, BookingPaymentStatus } from '@/lib/types';

import cashMessages from '../_cash-messages';
import pricingMessages from '../_pricing-messages';
import bookingMessages from '../buchungen/_messages';
import { CashRecordButton } from './cash-record';
import { InfoList, SectionCard } from './states';

/** Translated payment status pill */
export function PaymentBadge({ status }: { status: BookingPaymentStatus }) {
  return <StatusBadge kind="payment" status={status} />;
}

/** Payment summary on the admin booking detail page */
export function BookingPaymentCard({ booking, onChanged }: { booking: Booking; onChanged?: () => void }) {
  const t = useMessages(bookingMessages);
  const cash = useMessages(cashMessages);
  const pm = useMessages(pricingMessages);
  const f = useFormat();
  const payment = booking.payment;
  if (!payment) return null;

  const isCash = payment.method === 'cash';
  const expectedCents = payment.amountCents ?? booking.pricing?.payableCents ?? booking.estimate?.totalCents;
  const cashCollected = payment.cashCollectedCents != null;

  const items: [string, React.ReactNode][] = [
    [t.payment.amount, f.euro(expectedCents)],
    [
      t.payment.method,
      payment.method === 'invoice'
        ? t.payment.methodInvoice
        : payment.method === 'stripe'
          ? t.payment.methodStripe
          : payment.method === 'paypal'
            ? t.payment.methodPaypal
            : isCash
              ? cash.method
              : payment.method === 'gift_card'
                ? pm.methodGiftCard
                : '–',
    ],
  ];
  if (isCash) {
    items.push([
      cash.status,
      cashCollected ? (
        <span key="cash" className="space-y-0.5">
          <span className="block font-semibold text-pine-dark">
            {cash.collected(f.euro(payment.cashCollectedCents), f.dateTime(payment.cashCollectedAt))}
          </span>
          {expectedCents != null && payment.cashCollectedCents !== expectedCents && (
            <span className="block text-xs text-amber-800">{cash.mismatch(f.euro(expectedCents))}</span>
          )}
        </span>
      ) : (
        <span key="cash" className="font-medium text-amber-800">
          {cash.open}
        </span>
      ),
    ]);
    if (booking.workerPayout?.cashHeldCents) {
      items.push([cash.heldByWorker, f.euro(booking.workerPayout.cashHeldCents)]);
    }
  } else {
    items.push([t.payment.paidAt, f.dateTime(payment.paidAt)]);
  }
  if (payment.refundedAt) items.push([t.payment.refundedAt, f.dateTime(payment.refundedAt)]);
  if (booking.consents?.earlyStartRequestedAt) {
    items.push([t.payment.earlyStart, f.dateTime(booking.consents.earlyStartRequestedAt)]);
  }

  return (
    <SectionCard
      id="zahlung"
      title={
        <span className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-pine" aria-hidden="true" /> {t.payment.title}
        </span>
      }
      actions={<PaymentBadge status={payment.status} />}
    >
      <InfoList className="sm:grid-cols-1" items={items} />
      {payment.status === 'refund_pending' && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t.payment.refundPending}
        </p>
      )}
      {isCash && booking.status !== 'cancelled' && booking.status !== 'expired' && (
        <div className="mt-3">
          <CashRecordButton booking={booking} onChanged={onChanged} />
        </div>
      )}
      <Link
        href={`/admin/zahlungen?bookingId=${booking._id}`}
        className="mt-3 inline-flex rounded text-sm font-semibold text-pine underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t.payment.attempts}
      </Link>
    </SectionCard>
  );
}
