'use client';

import { CalendarDays, Check, Clock, FileText, House, MapPin, type LucideIcon } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Booking } from '@/lib/types';
import { cn } from '@/lib/utils';
import { slotRange } from '../../_shared/slot-range';
import messages from '../_messages';

export type PaymentStep = 0 | 1 | 2;

/** Three-step progress: Termin gewählt → Bezahlen → Bestätigt */
export function PaymentProgress({ current }: { current: PaymentStep }) {
  const t = useMessages(messages).progress;
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0 sm:gap-4" aria-label={t.label}>
      {t.steps.map((label, index) => {
        const done = index < current || (index === current && current === 2);
        const active = index === current && current !== 2;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold',
                done && 'border-pine bg-pine text-white',
                active && 'border-pine bg-white text-pine ring-4 ring-mint',
                !done && !active && 'border-border bg-white text-muted-grey'
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={cn('text-xs font-semibold sm:text-sm', done || active ? 'text-pine-dark' : 'text-muted-grey')}>
              {label}
              {done && <span className="sr-only">{t.done}</span>}
            </span>
            {index < t.steps.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2 text-sm text-charcoal">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-mint text-pine" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 pt-1">{children}</span>
    </li>
  );
}

/** Order summary card shown next to the payment content */
export function OrderSummary({
  booking,
  amountCents,
  payable,
  footer,
}: {
  booking: Booking;
  amountCents: number | null | undefined;
  /** "Zu zahlen" vs. "Preis" */
  payable: boolean;
  footer?: React.ReactNode;
}) {
  const t = useMessages(messages).summary;
  const tc = useMessages(common);
  const f = useFormat();
  return (
    <section aria-labelledby="order-summary-title" className="rounded-2xl border border-border bg-white">
      <div className="p-6">
        <h2 id="order-summary-title" className="m-0 text-lg font-bold text-pine-dark">
          {t.title}
        </h2>
        <ul className="m-0 mt-3 list-none p-0">
          <Row icon={FileText}>{t.booking(booking.reference)}</Row>
          <Row icon={House}>{tc.services[booking.serviceId] ?? booking.serviceId}</Row>
          <Row icon={Clock}>{t.duration(f.hours(booking.estimate?.durationMinutes))}</Row>
          <Row icon={CalendarDays}>
            {f.dateShort(booking.preferredDate)}, <span className="tabular-nums">{slotRange(f, booking.slot, booking.slotEnd, booking.estimate?.durationMinutes)}</span>
          </Row>
          <Row icon={MapPin}>
            {booking.customerDetails.address}, {booking.customerDetails.postcode} {t.city}
          </Row>
        </ul>
      </div>
      <div className="border-t border-border p-6">
        <p className="m-0 flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-pine-dark">{payable ? t.amount : t.total}</span>
          <span className="text-2xl font-bold tabular-nums text-pine-dark">{f.euro(amountCents)}</span>
        </p>
        {booking.estimate?.pricesIncludeVat && <p className="m-0 mt-1 text-right text-xs text-muted-grey">{tc.units.inclVat}</p>}
        {footer}
      </div>
    </section>
  );
}
