'use client';

// Transparent price breakdown from the server (never computed in the browser):
//   Reinigung (X Std. × rate) · Zusatzleistungen · recurring discount ·
//   promotion · Gesamt inkl. MwSt. (+ contained VAT) · gift cards · Zu zahlen
//
//   <QuoteBreakdown quote={quote} />                       // POST /bookings/quote
//   <PricingBreakdown pricing={booking.pricing} estimate={booking.estimate} />
import { Gift } from 'lucide-react';

import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/config';
import type { BookingPricing, DiscountType, Estimate, LocalizedText, PromotionKind, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';
import messages, { type PricingMessages } from './pricing-messages';
import { formatDiscount, formatPct, maskedGiftCode, pickText } from './promotions';

interface PromotionInfo {
  kind: PromotionKind;
  name: string;
  code: string | null;
  discountType: DiscountType;
  discountValue: number;
  title?: LocalizedText;
}

interface BreakdownModel {
  durationMinutes?: number;
  hourlyRateCents?: number;
  labourCents?: number;
  extraFeesCents?: number;
  subtotalCents: number;
  recurringDiscountCents: number;
  promotion: PromotionInfo | null;
  promotionDiscountCents: number;
  totalCents: number;
  vatRate: number;
  vatCents: number;
  giftCards: { key: string; code: string; amountCents: number; remainingAfterCents?: number; released?: boolean }[];
  payableCents: number;
}

/** Label of the applied promotion, e.g. "Willkommensrabatt −10 %" or "Code XMAS10 (−10 %)" */
export function promotionLabel(promo: PromotionInfo, t: PricingMessages, locale: Locale): string {
  const value = formatDiscount(promo.discountType, promo.discountValue, locale);
  if (promo.kind === 'welcome') return t.breakdown.welcome(value);
  if (promo.code) return t.breakdown.code(promo.code, value);
  return t.breakdown.promotion(pickText(promo.title, locale) || promo.name, value);
}

const fromQuote = (quote: Quote): BreakdownModel => ({
  durationMinutes: quote.estimate.durationMinutes,
  hourlyRateCents: quote.estimate.hourlyRateCents,
  labourCents: quote.lines.labourCents,
  extraFeesCents: quote.lines.extraFeesCents,
  subtotalCents: quote.lines.subtotalCents,
  recurringDiscountCents: quote.lines.recurringDiscountCents,
  promotion: quote.promotion,
  promotionDiscountCents: quote.lines.promotionDiscountCents,
  totalCents: quote.lines.totalCents,
  vatRate: quote.lines.vatRate,
  vatCents: quote.lines.vatCents,
  giftCards: quote.giftCards
    .filter((g) => g.ok && g.appliedCents > 0)
    .map((g, i) => ({ key: `${g.code}-${i}`, code: g.code, amountCents: g.appliedCents, remainingAfterCents: g.remainingAfterCents })),
  payableCents: quote.lines.payableCents,
});

const fromPricing = (pricing: BookingPricing, estimate?: Estimate | null): BreakdownModel => ({
  durationMinutes: estimate?.durationMinutes,
  hourlyRateCents: estimate?.hourlyRateCents,
  labourCents: estimate?.labourCents,
  extraFeesCents: estimate?.extraFeesCents,
  subtotalCents: pricing.subtotalCents,
  recurringDiscountCents: pricing.recurringDiscountCents,
  promotion: pricing.promotion,
  promotionDiscountCents: pricing.promotionDiscountCents,
  totalCents: pricing.totalCents,
  vatRate: pricing.vatRate,
  vatCents: pricing.vatCents,
  giftCards: (pricing.giftCards ?? []).map((g, i) => ({
    key: `${g.codeLast4}-${i}`,
    code: maskedGiftCode(g.codeLast4),
    amountCents: g.amountCents,
    released: g.state === 'released',
  })),
  payableCents: pricing.payableCents,
});

function Breakdown({ model, compact = false }: { model: BreakdownModel; compact?: boolean }) {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const f = useFormat();
  const b = t.breakdown;
  const rate = formatPct(Math.round(model.vatRate * 1000) / 10, locale);
  const hasLabourSplit = model.labourCents != null && model.durationMinutes != null && model.hourlyRateCents != null;
  const showPayable = model.giftCards.length > 0 || model.payableCents !== model.totalCents;

  const row = (label: React.ReactNode, value: string, className?: string, sub?: React.ReactNode) => (
    <div className={cn('flex items-baseline justify-between gap-3', compact ? 'py-1 text-sm' : 'py-1.5 text-sm', className)}>
      <dt className="min-w-0 text-muted-grey">
        {label}
        {sub && <span className="block text-xs text-muted-grey">{sub}</span>}
      </dt>
      <dd className="m-0 shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  );

  return (
    <dl className="m-0">
      {hasLabourSplit ? (
        <>
          {row(
            <>
              {b.labour} <span className="tabular-nums">({b.labourDetail(f.hours(model.durationMinutes), f.euro(model.hourlyRateCents))})</span>
            </>,
            f.euro(model.labourCents)
          )}
          {(model.extraFeesCents ?? 0) > 0 && row(b.extras, f.euro(model.extraFeesCents))}
        </>
      ) : (
        row(b.subtotal, f.euro(model.subtotalCents))
      )}
      {model.recurringDiscountCents > 0 && row(b.recurring, `− ${f.euro(model.recurringDiscountCents)}`, '[&_dd]:text-pine [&_dt]:text-pine')}
      {model.promotion && model.promotionDiscountCents > 0 &&
        row(promotionLabel(model.promotion, t, locale), `− ${f.euro(model.promotionDiscountCents)}`, 'font-semibold [&_dd]:text-pine [&_dt]:text-pine')}

      <div className={cn('mt-2 border-t border-border pt-2', !showPayable && 'pt-3')}>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={cn('font-bold text-pine-dark', showPayable ? 'text-sm' : 'text-sm')}>{b.total}</dt>
          <dd className={cn('m-0 font-bold tabular-nums text-pine-dark', showPayable ? 'text-base' : compact ? 'text-2xl' : 'text-xl')}>
            {f.euro(model.totalCents)}
          </dd>
        </div>
        {model.vatRate > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-grey">
            <dt>{b.vat(rate)}</dt>
            <dd className="m-0 tabular-nums">{f.euro(model.vatCents)}</dd>
          </div>
        )}
      </div>

      {model.giftCards.map((g) => (
        <div key={g.key} className={cn('flex items-baseline justify-between gap-3 py-1.5 text-sm', g.released && 'opacity-60')}>
          <dt className="min-w-0 text-pine">
            <span className="flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="break-all">{b.giftCard(g.code)}</span>
            </span>
            {g.remainingAfterCents != null && <span className="block text-xs text-muted-grey">{b.giftRemaining(f.euro(g.remainingAfterCents))}</span>}
            {g.released && <span className="block text-xs text-muted-grey">{b.giftReleased}</span>}
          </dt>
          <dd className={cn('m-0 shrink-0 text-right tabular-nums text-pine', g.released && 'line-through')}>− {f.euro(g.amountCents)}</dd>
        </div>
      ))}

      {showPayable && (
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <dt className="text-sm font-bold text-pine-dark">{b.payable}</dt>
          <dd className={cn('m-0 font-bold tabular-nums text-pine-dark', compact ? 'text-2xl' : 'text-xl')}>{f.euro(model.payableCents)}</dd>
        </div>
      )}
    </dl>
  );
}

export function QuoteBreakdown({ quote, compact }: { quote: Quote; compact?: boolean }) {
  return <Breakdown model={fromQuote(quote)} compact={compact} />;
}

export function PricingBreakdown({ pricing, estimate, compact }: { pricing: BookingPricing; estimate?: Estimate | null; compact?: boolean }) {
  return <Breakdown model={fromPricing(pricing, estimate)} compact={compact} />;
}
