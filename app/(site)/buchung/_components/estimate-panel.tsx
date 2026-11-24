'use client';

import { useState } from 'react';
import { CalendarDays, ChevronUp, Clock, House, ListChecks, LoaderCircle, MapPin, Repeat, type LucideIcon } from 'lucide-react';

import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { Estimate, Frequency } from '@/lib/types';
import { cn } from '@/lib/utils';
import messages from '../_messages';
import flowMessages from '../_flow-messages';
import type { EstimateState, QuoteState } from '../_lib/hooks';
import { QuoteBreakdown } from '../../_shared/price-breakdown';
import pricingMessages from '../../_shared/pricing-messages';
import { formatPct } from '../../_shared/promotions';
import { dateValueToIso, type HouseholdServiceId } from '../_lib/wizard';

export interface SummaryData {
  serviceId: HouseholdServiceId | null;
  frequency: Frequency;
  postcode: string | null;
  date: string;
  slotStart: string;
  slotEnd: string;
  extrasCount: number;
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

function SummaryRows({ data, estimate }: { data: SummaryData; estimate: Estimate | null }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const extraText = cat.extras as Record<string, { label: string } | undefined>;
  const muted = (text: string) => <span className="text-muted-grey">{text}</span>;
  return (
    <ul className="m-0 list-none p-0">
      <Row icon={Repeat}>{tc.frequencies[data.frequency]}</Row>
      <Row icon={House}>{data.serviceId ? tc.services[data.serviceId] : muted(t.summary.serviceOpen)}</Row>
      <Row icon={Clock}>{estimate ? t.summary.duration(f.hours(estimate.durationMinutes)) : muted(t.summary.durationOpen)}</Row>
      <Row icon={CalendarDays}>
        {data.date ? (
          <>
            {f.dateShort(dateValueToIso(data.date))}
            {data.slotStart ? `, ${f.slot(data.slotStart, data.slotEnd)}` : ''}
          </>
        ) : (
          muted(t.summary.dateOpen)
        )}
      </Row>
      <Row icon={MapPin}>{data.postcode ? t.summary.postcode(data.postcode) : muted(t.summary.postcodeOpen)}</Row>
      <Row icon={ListChecks}>
        {data.extrasCount === 0 ? (
          muted(t.summary.extrasNone)
        ) : estimate && estimate.extras.length > 0 ? (
          <>
            {t.summary.extras(estimate.extras.length)}
            <span className="mt-0.5 grid gap-0.5 text-xs text-muted-grey">
              {estimate.extras.map((e) => (
                <span key={e.id}>
                  {extraText[e.id]?.label ?? e.label} · +{tc.units.minutesShort(e.minutes)}
                  {e.priceCents > 0 ? ` · ${f.euro(e.priceCents)}` : ''}
                </span>
              ))}
            </span>
          </>
        ) : (
          t.summary.extras(data.extrasCount)
        )}
      </Row>
    </ul>
  );
}

function TotalFooter({ quote, hasInput }: { quote: QuoteState; hasInput: boolean }) {
  const t = useMessages(messages);
  const tq = useMessages(pricingMessages).breakdown;
  if (!hasInput) {
    return <p className="m-0 text-sm text-muted-grey">{t.summary.priceWhen}</p>;
  }
  if (quote.error && !quote.loading && !quote.quote) {
    return (
      <div role="alert" className="grid gap-1 text-sm text-red-800">
        <p className="m-0">
          {t.summary.priceError} {quote.error}
        </p>
        <button type="button" onClick={quote.retry} className="min-h-[44px] w-fit font-bold underline">
          {t.retry}
        </button>
      </div>
    );
  }
  if (!quote.quote) {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-grey">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.summary.calculating}
      </p>
    );
  }
  return (
    <div className={cn('grid gap-1 transition-opacity', !quote.isCurrent && 'opacity-60')} aria-busy={quote.loading}>
      <QuoteBreakdown quote={quote.quote} compact />
      {!quote.isCurrent && <span className="sr-only">{tq.updating}</span>}
    </div>
  );
}

/** Line-by-line breakdown of a server estimate (checkout price card, booking details) */
export function EstimateBreakdown({ estimate }: { estimate: Estimate }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const f = useFormat();
  const line = (label: string, value: string, className?: string) => (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-sm', className)}>
      <dt className="text-muted-grey">{label}</dt>
      <dd className="m-0 text-right tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="m-0">
      {line(t.breakdown.duration, f.hours(estimate.durationMinutes))}
      {line(t.breakdown.hourlyRate, f.euro(estimate.hourlyRateCents))}
      {line(t.breakdown.labour, f.euro(estimate.labourCents))}
      {estimate.extraFeesCents > 0 && line(t.breakdown.extraFees, f.euro(estimate.extraFeesCents))}
      {estimate.discountCents > 0 && line(t.breakdown.discount, `− ${f.euro(estimate.discountCents)}`, '[&_dd]:text-pine')}
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <dt className="text-sm font-bold text-pine-dark">{t.breakdown.total}</dt>
        <dd className="m-0 text-xl font-bold tabular-nums text-pine-dark">{f.euro(estimate.totalCents)}</dd>
      </div>
      {estimate.pricesIncludeVat && <p className="m-0 mt-1 text-right text-xs text-muted-grey">{tc.units.inclVat}</p>}
    </dl>
  );
}

/** Sticky "Zusammenfassung" card (desktop) */
export function SummaryCard({
  data,
  state,
  quote,
  hasInput,
  aside,
}: {
  data: SummaryData;
  state: EstimateState;
  quote: QuoteState;
  hasInput: boolean;
  /** Extra content below the price (e.g. welcome-offer hint) */
  aside?: React.ReactNode;
}) {
  const t = useMessages(messages);
  const tf = useMessages(flowMessages).summary;
  return (
    <aside aria-labelledby="summary-title" className="hidden lg:block">
      <div className="sticky top-28 rounded-2xl border border-border bg-white p-6 shadow-[0_12px_25px_rgba(36,49,43,0.05)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="summary-title" className="m-0 text-lg font-bold tracking-tight text-pine-dark">
            {t.summary.title}
          </h2>
          {(state.loading || quote.loading) && <LoaderCircle className="h-4 w-4 animate-spin text-pine" aria-label={t.summary.updating} />}
        </div>
        <SummaryRows data={data} estimate={hasInput ? state.estimate : null} />
        <div className="mt-3 border-t border-border pt-4" aria-live="polite">
          <TotalFooter quote={quote} hasInput={hasInput} />
        </div>
        {aside && <div className="mt-4">{aside}</div>}
        <p className="mb-0 mt-4 rounded-[10px] bg-cream p-3 text-xs leading-relaxed text-muted-grey">{tf.note}</p>
      </div>
    </aside>
  );
}

/** Sticky bottom bar on phones/tablets: total + expandable summary */
export function SummaryMobileBar({ data, state, quote, hasInput }: { data: SummaryData; state: EstimateState; quote: QuoteState; hasInput: boolean }) {
  const t = useMessages(messages);
  const tq = useMessages(pricingMessages).breakdown;
  const { locale } = useLocale();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const { estimate } = state;
  const loading = quote.loading;
  const q = quote.quote;

  let total: React.ReactNode = '–';
  if (hasInput && quote.error && !loading && !q) total = t.summary.unavailable;
  else if (hasInput && q) total = f.euro(q.lines.payableCents);
  else if (hasInput) total = '…';
  const payableLabel = q && q.lines.payableCents !== q.lines.totalCents ? tq.payable : t.summary.total;
  const vat = q && q.lines.vatRate > 0 ? tq.vatInline(f.euro(q.lines.vatCents), formatPct(Math.round(q.lines.vatRate * 1000) / 10, locale)) : null;

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-white/95 shadow-[0_-8px_24px_rgba(36,49,43,0.08)] backdrop-blur lg:hidden">
      <div id="summary-mobile-details" hidden={!open} className="shell max-h-[55vh] overflow-y-auto pt-4">
        <h2 className="mb-1 text-base font-bold tracking-tight text-pine-dark">{t.summary.title}</h2>
        <SummaryRows data={data} estimate={hasInput ? estimate : null} />
        <div className="mt-2 border-t border-border pt-3">
          <TotalFooter quote={quote} hasInput={hasInput} />
        </div>
      </div>
      <div className="shell flex items-center justify-between gap-3 py-3">
        <div className="min-w-0" aria-live="polite">
          <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-muted-grey">{payableLabel}</p>
          <p className="m-0 flex flex-wrap items-center gap-x-2 text-lg font-bold text-pine-dark">
            <span className={cn('tabular-nums', loading && 'opacity-60')}>{total}</span>
            {hasInput && vat && <span className="text-[11px] font-semibold text-muted-grey">{vat}</span>}
            {loading && <LoaderCircle className="h-4 w-4 animate-spin text-pine" aria-hidden="true" />}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="summary-mobile-details"
          className="button button-small button-quiet min-h-[44px] shrink-0"
        >
          {open ? t.summary.close : t.summary.details}
          <ChevronUp className={cn('h-4 w-4 transition-transform', !open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
