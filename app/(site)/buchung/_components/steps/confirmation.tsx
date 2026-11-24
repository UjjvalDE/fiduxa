'use client';

import Link from 'next/link';
import { ArrowRight, Banknote, CircleCheck, Gift, ReceiptText } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { BookingPayment, BookingPricing, BookingStatus, Estimate } from '@/lib/types';
import { PricingBreakdown } from '../../../_shared/price-breakdown';
import pricingMessages from '../../../_shared/pricing-messages';
import { slotRange } from '../../../_shared/slot-range';
import messages from '../../_messages';
import flowMessages from '../../_flow-messages';

/** Booking as returned by POST /bookings */
export interface CreatedBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  estimate: Estimate;
  preferredDate: string;
  slot: string;
  slotEnd?: string;
  holdExpiresAt?: string | null;
  payment?: BookingPayment;
  /** Price snapshot (promotion, VAT, gift cards, payable) */
  pricing?: BookingPricing;
}

/** Shown when the booking was confirmed directly: cash after the cleaning, or invoice (no online payment configured) */
export function Confirmation({ booking, headingRef, email }: { booking: CreatedBooking; headingRef: React.Ref<HTMLHeadingElement>; email: string }) {
  const t = useMessages(messages).confirmation;
  const tf = useMessages(flowMessages).confirmation;
  const f = useFormat();
  const tq = useMessages(pricingMessages);
  const cash = booking.payment?.method === 'cash';
  const giftCard = booking.payment?.method === 'gift_card';
  const amount = f.euro(booking.payment?.amountCents ?? booking.estimate.totalCents);
  // Invoice steps mention a bill – not for gift-card bookings
  const nextSteps = cash ? tf.nextCash : giftCard ? t.next.filter((_, i) => i !== 1) : t.next;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-border bg-white p-6 text-center shadow-[0_12px_25px_rgba(36,49,43,0.05)] sm:p-10">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-mint text-pine">
          <CircleCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="m-0 text-2xl font-bold tracking-tight text-pine-dark outline-none sm:text-3xl">
          {t.title}
        </h2>
        <p className="mx-auto mb-0 mt-3 max-w-md text-[15px] leading-relaxed text-muted-grey">{t.text(email)}</p>

        <dl className="mx-auto mt-7 grid max-w-md gap-3 rounded-[14px] bg-cream p-5 text-left text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-grey">{t.reference}</dt>
            <dd className="m-0 font-bold tracking-wide text-pine-dark">{booking.reference}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-grey">{t.date}</dt>
            <dd className="m-0 text-right font-semibold text-pine-dark">
              {f.dateLong(booking.preferredDate)}
              <br />
              <span className="font-normal tabular-nums">{slotRange(f, booking.slot, booking.slotEnd, booking.estimate.durationMinutes)}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-grey">{t.total}</dt>
            <dd className="m-0 font-semibold text-pine-dark">
              {f.hours(booking.estimate.durationMinutes)} · {amount}
            </dd>
          </div>
        </dl>
        {booking.pricing && (
          <div className="mx-auto mt-4 max-w-md rounded-[14px] border border-border p-5 text-left">
            <PricingBreakdown pricing={booking.pricing} estimate={booking.estimate} />
          </div>
        )}
        <p className="mx-auto mb-0 mt-5 flex max-w-md items-start gap-2 rounded-[12px] border border-sage bg-mint p-3 text-left text-sm leading-relaxed text-pine-dark">
          {giftCard ? (
            <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : cash ? (
            <Banknote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {giftCard ? tq.submit.paidByGiftCard : cash ? tf.cash(amount) : t.invoice}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-white p-6 sm:p-8">
        <h3 className="mb-4 mt-0 text-lg font-bold text-pine-dark">{t.nextTitle}</h3>
        <ol className="m-0 grid list-none gap-4 p-0">
          {nextSteps.map(([title, text], index) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pine text-xs font-bold text-white" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong className="block text-sm text-pine-dark">{title}</strong>
                <span className="text-sm leading-relaxed text-muted-grey">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={`/konto/buchungen/${booking.id}`} className="button">
            {t.viewBooking} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/" className="button button-quiet">
            {t.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
