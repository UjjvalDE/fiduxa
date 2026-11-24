'use client';

import Link from 'next/link';
import { Receipt } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Booking } from '@/lib/types';
import { cn } from '@/lib/utils';

import pricingMessages from '../_pricing-messages';
import { SectionCard } from './states';

const GIFT_STATE_CLASSES: Record<string, string> = {
  reserved: 'bg-sky-50 text-sky-800 border-sky-200',
  captured: 'bg-mint text-pine border-sage',
  released: 'bg-gray-100 text-gray-600 border-gray-200',
};

/** Price snapshot of a booking created with the quote engine (booking.pricing) */
export function BookingPricingCard({ booking }: { booking: Booking }) {
  const t = useMessages(pricingMessages);
  const f = useFormat();
  const p = booking.pricing;
  if (!p) return null;

  const rate = `${f.number((p.vatRate ?? 0) * 100, { maximumFractionDigits: 2 })} %`;
  const promo = p.promotion;
  const promoValue =
    promo &&
    (promo.discountType === 'percent'
      ? `${f.number(promo.discountValue, { maximumFractionDigits: 2 })} %`
      : f.euro(promo.discountValue));

  const row = (label: React.ReactNode, value: React.ReactNode, className?: string) => (
    <div className={cn('flex justify-between gap-4 py-2', className)}>
      <dt className="text-muted-grey">{label}</dt>
      <dd className="text-right tabular-nums text-charcoal">{value}</dd>
    </div>
  );

  return (
    <SectionCard
      id="preis"
      title={
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-pine" aria-hidden="true" /> {t.title}
        </span>
      }
    >
      <dl className="divide-y divide-border text-sm">
        {row(t.subtotal, f.euro(p.subtotalCents))}
        {p.recurringDiscountCents > 0 && row(t.recurring, `− ${f.euro(p.recurringDiscountCents)}`)}
        {p.recurringDiscountCents > 0 && row(t.price, f.euro(p.priceCents))}
        {promo ? (
          row(
            <span>
              {t.promotion}:{' '}
              {promo.id ? (
                <Link href={`/admin/aktionen/${promo.id}`} className="font-medium text-pine hover:underline">
                  {promo.name}
                </Link>
              ) : (
                <span className="font-medium text-charcoal">{promo.name}</span>
              )}
              {promo.code && <span className="ml-1 font-mono text-xs">({promo.code})</span>}
              <span className="block text-xs">{promoValue}</span>
            </span>,
            <span className="font-semibold text-pine">− {f.euro(p.promotionDiscountCents)}</span>
          )
        ) : (
          row(t.promotion, <span className="text-muted-grey">{t.promotionNone}</span>)
        )}
        <div className="flex justify-between gap-4 py-2 font-semibold">
          <dt className="text-pine-dark">
            {p.vatRate > 0 ? t.total : t.totalNoVat}
            {p.vatRate > 0 && <span className="block text-xs font-normal text-muted-grey">{t.vat(rate)}: {f.euro(p.vatCents)}</span>}
          </dt>
          <dd className="text-right tabular-nums text-pine-dark">{f.euro(p.totalCents)}</dd>
        </div>
        {(p.giftCards?.length ?? 0) > 0 && (
          <div className="py-2">
            <dt className="mb-1 text-muted-grey">{t.giftCards}</dt>
            <dd>
              <ul className="space-y-1.5">
                {p.giftCards!.map((g, i) => (
                  <li key={`${g.giftCard}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {g.giftCard ? (
                        <Link
                          href={`/admin/gutscheine/${g.giftCard}`}
                          className="font-mono text-pine hover:underline"
                          title={t.openCard}
                        >
                          {t.giftCard(g.codeLast4)}
                        </Link>
                      ) : (
                        <span className="font-mono">{t.giftCard(g.codeLast4)}</span>
                      )}
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          GIFT_STATE_CLASSES[g.state] ?? GIFT_STATE_CLASSES.reserved
                        )}
                      >
                        {t.giftStates[g.state] ?? g.state}
                      </span>
                    </span>
                    <span className={cn('tabular-nums', g.state === 'released' ? 'text-muted-grey line-through' : 'text-charcoal')}>
                      − {f.euro(g.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4 py-2 text-base font-bold">
          <dt className="text-pine-dark">
            {t.payable}
            <span className="block text-xs font-normal text-muted-grey">{t.payableHint}</span>
          </dt>
          <dd className="text-right tabular-nums text-pine-dark">{f.euro(p.payableCents)}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}
